const { v4: uuidv4 } = require("uuid");
const db = require("../db/connection");
const logger = require("../utils/logger");
const CallbackService = require("../services/callbackServices");

const callbackService = new CallbackService();

const TARGET_TIMEZONE = "America/New_York";
// Canonical CSV headers - USED FOR EXPORT
const PATIENT_FIELDS = [
  "mrn",
  "first_name",
  "last_name",
  "dob",
  "zip_code",
  "address_street",
  "address_city",
  "phone",
  "email",
  "insurance_name",
  "carrier_code",
  "insurance_id",
  "referring_physician_name",
  "modality_name",
  "procedure_name",
  "procedure_code",
  "booked_modality_name",
  "appointment_date",
  "appointment_time",
  "appointment_location",
  "appointment_booked",
  "reason",
  "metallic_implant",
  "eye_fragments",
  "foreign_metallic_object",
  "claustrophobic",
  "human_transfer",
  "reason_for_transfer",
];

/**
 * Helper function to format the current local date as YYYY-MM-DD.
 */
const getTodayDateString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * Escape CSV values manually without any library.
 */
function escapeCSV(value) {
  if (value === null || value === undefined) return "";

  let str = String(value).trim();

  // Force quotes if the value is numeric-only (prevents Excel auto-formatting)
  if (/^\d+$/.test(str)) {
    return `"${str}"`;
  }

  // If contains comma, quote or newline → wrap with quotes
  if (/[",\n]/.test(str)) {
    str = str.replace(/"/g, '""');
    return `"${str}"`;
  }

  return str;
}

/**
 * Convert JS objects → CSV string manually.
 */
function convertToCSV(rows, fields) {
  let csv = fields.join(",") + "\n"; // header row

  for (const row of rows) {
    const line = fields.map((field) => escapeCSV(row[field])).join(",");
    csv += line + "\n";
  }

  return csv;
}

/**
 * Export Patient Data for future, booked appointments, converting time from UTC to TARGET_TIMEZONE.
 * @returns {Promise<string>} CSV content string.
 */
async function exportPatientData() {
  logger.info("Starting patient data export process...");
  try {
    const query = `
    SELECT  
    mrn, -- Map DB's patient_id to CSV's mrn
    first_name, last_name, dob, 
    zip_code, address_street, address_city, phone, email, 
    insurance_name, carrier_code, insurance_id, 
    referring_physician_name, modality_name, procedure_name, procedure_code, 
    
    NULL AS booked_modality_name, 

    -- CONVERTED APPOINTMENT_DATE (from UTC to EST)
    TO_CHAR(
      (appointment_date::text || ' ' || appointment_time)::timestamp AT TIME ZONE 'UTC' AT TIME ZONE $1,
      'YYYY-MM-DD'
    ) AS appointment_date, 
    -- CONVERTED APPOINTMENT_TIME (from UTC to EST)
    TO_CHAR(
      (appointment_date::text || ' ' || appointment_time)::timestamp AT TIME ZONE 'UTC' AT TIME ZONE $1,
      'HH24:MI:SS'
    ) AS appointment_time,
    
    appointment_location, appointment_booked, 
    
    -- FIX: Assuming separate columns as requested
    reason, 
    metallic_implant, 
    eye_fragments, 
    foreign_metallic_object, 
    claustrophobic, 
    human_transfer, 
    reason_for_transfer
    
FROM patient_details
WHERE 
    -- 1. Must have valid appointment time/date data for conversion
    NULLIF(TRIM(appointment_date::text), '') IS NOT NULL AND 
    NULLIF(TRIM(appointment_time::text), '') IS NOT NULL AND 
    
    -- 2. Appointment must be booked
    appointment_booked = TRUE AND

    -- 3. Appointment must be in the future (after NOW(), adjusted to TARGET_TIMEZONE)
    (appointment_date::text || ' ' || appointment_time)::timestamp AT TIME ZONE 'UTC' AT TIME ZONE $1 >= NOW() AT TIME ZONE $1
ORDER BY appointment_date ASC, appointment_time ASC
    `;

    const result = await db.query(query, [TARGET_TIMEZONE]);
    const records = result.rows;

    if (records.length === 0) {
      logger.warn("No patient appointments found for export.");
      return PATIENT_FIELDS.join(",") + "\n";
    }

    const csvContent = convertToCSV(records, PATIENT_FIELDS);

    logger.info(`Successfully exported ${records.length} records.`);
    return csvContent;
  } catch (error) {
    logger.error("Error exporting patient data:", error.message);
    throw new Error("Failed to export CSV");
  }
}
// ----------------------------------------------------------------------
/**
 * Standardizes and imports an array of patient records, performing an upsert operation.
 * Uses 'mrn' as the unique identifier mapped to the 'patient_id' column.
 * Imports data only up to procedure_code.
 * @param {Array<Object>} records - Array of patient records to import.
 * @returns {Promise<Object>} Summary of the import process.
 */
async function importPatientData(records) {
  logger.info(`Starting patient data import for ${records.length} records...`);

  let importedPatients = 0;

  for (const record of records) {
    // Use 'mrn' from the import record as the patient_id (DB's primary key)
    const patientId = uuidv4();

    const createdAtTimestamp = new Date().toISOString();
    const updatedAtTimestamp = createdAtTimestamp; 

    // List of fields we are actually importing/updating (up to procedure_code, plus timestamps)
    const importedFields = [
      "patient_id",
      "first_name",
      "last_name",
      "dob",
      "zip_code",
      "address_street",
      "address_city",
      "phone",
      "email",
      "insurance_name",
      "carrier_code",
      "insurance_id",
      "referring_physician_name",
      "modality_name",
      "procedure_name",
      "procedure_code",
      "created_at",
      "updated_at",
      "mrn",
    ];

    // Build the parameter array based on the importedFields list
    const params = [
      patientId, // $1
      record.first_name || null, // $2
      record.last_name || null, // $3
      record.dob || null, // $4
      record.zip_code || null, // $5
      record.address_street || null, // $6
      record.address_city || null, // $7
      record.phone || null, // $8
      record.email || null, // $9
      record.insurance_name || null, // $10
      record.carrier_code || null, // $11
      record.insurance_id || null, // $12
      record.referring_physician_name || null, // $13
      record.modality_name || null, // $14
      record.procedure_name || null, // $15
      record.procedure_code || null, // $16
      createdAtTimestamp, // $17
      updatedAtTimestamp, // $18
      record.mrn,
    ];

    // Generate the parameterized list for VALUES ($1, $2, ...)
    const valuePlaceholders = importedFields
      .map((_, i) => `$${i + 1}`)
      .join(", ");

    // Generate the SET clauses for DO UPDATE (e.g., first_name = EXCLUDED.first_name)
    // Skip patient_id, created_at
    const setClauses = importedFields
      .filter((f) => f !== "patient_id" && f !== "created_at")
      .map((f) => `${f} = EXCLUDED.${f}`)
      .join(",\n          ");

    const patientUpsertQuery = `
  INSERT INTO patient_details (${importedFields.join(", ")}) 
  VALUES (${valuePlaceholders})
  ON CONFLICT (patient_id) DO UPDATE 
  SET 
          ${setClauses}
                `;

    try {
      await db.query(patientUpsertQuery, params);
      importedPatients++;

      // Schedule the callback logic (unchanged)
      const scheduledCallbackTime =
        callbackService.calculateScheduledTime(createdAtTimestamp);
      const agentCallbackNumber =
        process.env.DEFAULT_AGENT_CALLBACK_NUMBER || null;
      const callbackReason = "Patient Data Imported (Outreach Required)";

      const callbackId = await callbackService.scheduleCallback(
        patientId,
        agentCallbackNumber,
        scheduledCallbackTime,
        callbackReason
      );

      logger.info(`Successfully imported ${callbackId}.`);
    } catch (error) {
      logger.error(`Failed to upsert patient ${patientId}: ${error.message}`);
    }
  }

  logger.info(`Successfully imported ${importedPatients} records.`);

  return {
    totalRecords: records.length,
    patientsImported: importedPatients,
    message: `Patient data upsert complete. Imported/Updated ${importedPatients} records.`,
  };
}

module.exports = {
  exportPatientData,
  importPatientData,
};
