const { v4: uuidv4 } = require("uuid");
const db = require("../db/connection");
const logger = require("../utils/logger");
const csv = require("csv-stringify");
const CallbackService = require("../services/callbackServices");

const callbackService = new CallbackService();
 
const TARGET_TIMEZONE = "America/New_York";
// Canonical CSV headers
const PATIENT_FIELDS = [
  "patient_id", "first_name", "last_name", "dob", "email", "phone",
  "address_street", "address_city", "zip_code", "insurance_id",
  "insurance_name", "insurance_verified", "appointment_type",
  "appointment_date", "appointment_time", "appointment_location",
  "call_status",
  "referring_physician_name", "modality_name", "procedure_name",
  "procedure_code", "appointment_booked", "precision_center",
  "answers_to_screening_questions",
];

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
 * Export Patient Data WITHOUT ANY CSV LIBRARY
 */
async function exportPatientData() {
  logger.info("Starting patient data export process...");
  try { 

    // SQL query to fetch data, converting appointment time/date to TARGET_TIMEZONE (America/New_York). 
    const query = `
    SELECT 
  patient_id, first_name, last_name, dob, email, phone,
  address_street, address_city, zip_code, insurance_id,
  insurance_name, insurance_verified, appointment_type,
  TO_CHAR(
    (appointment_date::text || ' ' || appointment_time)::timestamp
        AT TIME ZONE 'UTC' AT TIME ZONE $1,
    'YYYY-MM-DD'
  ) AS appointment_date,
  TO_CHAR(
    (appointment_date::text || ' ' || appointment_time)::timestamp
        AT TIME ZONE 'UTC' AT TIME ZONE $1,
    'HH24:MI:SS'
  ) AS appointment_time,
  appointment_location,
  call_status,
  referring_physician_name, modality_name, procedure_name,
  procedure_code, appointment_booked, precision_center,
  answers_to_screening_questions
FROM patient_details
WHERE 
  appointment_date IS NOT NULL
  AND appointment_time IS NOT NULL
  AND TRIM(appointment_date::text) NOT IN ('', 'null', 'NULL', '[null]', '[NULL]')
  AND TRIM(appointment_time::text) NOT IN ('', 'null', 'NULL', '[null]', '[NULL]')
  AND (
    (appointment_date::text || ' ' || appointment_time)::timestamp
  ) >= NOW() AT TIME ZONE 'UTC'
ORDER BY appointment_date ASC, appointment_time ASC
    `;

    const result = await db.query(query, [TARGET_TIMEZONE]);
    const records = result.rows;

    if (records.length === 0) {
      logger.warn("No patient appointments found for export.");
      return PATIENT_FIELDS.join(",") + "\n";
    }

    // Convert result rows → CSV (manual)
    const csv = convertToCSV(records, PATIENT_FIELDS);

    logger.info(`Successfully exported ${records.length} records.`);
    return csv;

  } catch (error) {
    logger.error("Error exporting patient data:", error.message);
    throw new Error("Failed to export CSV");
  }
}
/**
 * Standardizes and imports an array of patient records, performing an upsert operation.
 * @param {Array<Object>} records - Array of patient records to import.
 * @returns {Promise<Object>} Summary of the import process.
 */
async function importPatientData(records) {
  // ... (importPatientData function remains the same)
  logger.info(`Starting patient data import for ${records.length} records...`);

  let importedPatients = 0;

  for (const record of records) {
    // Use the existing patient_id or generate a new UUID
    const patientId = record.patient_id || uuidv4();

    // --- Manual Timestamp Creation: Always uses native JavaScript Date ---
    const createdAtTimestamp = new Date().toISOString();
    const updatedAtTimestamp = createdAtTimestamp; // Set updated_at on initial insert/update

    // --- Patient Upsert Logic (Handling all fields) ---
    const patientUpsertQuery = `
  INSERT INTO patient_details (
          patient_id, first_name, last_name, dob, email, phone, 
          address_street, address_city, zip_code, insurance_id, 
          insurance_name, insurance_verified, appointment_type, 
          appointment_date, appointment_time, appointment_location,
          call_status, call_count, created_at, 
          referring_physician_name, modality_name, procedure_name, procedure_code, 
          appointment_booked, precision_center, answers_to_screening_questions, 
          call_config, updated_at
  ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 
          $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28
  )
  ON CONFLICT (patient_id) DO UPDATE 
  SET 
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          dob = EXCLUDED.dob,
          email = EXCLUDED.email,
          phone = EXCLUDED.phone,
          address_street = EXCLUDED.address_street,
          address_city = EXCLUDED.address_city,
          zip_code = EXCLUDED.zip_code,
          insurance_id = EXCLUDED.insurance_id,
          insurance_name = EXCLUDED.insurance_name,
          insurance_verified = EXCLUDED.insurance_verified,
          appointment_type = EXCLUDED.appointment_type,
          appointment_date = EXCLUDED.appointment_date,
          appointment_time = EXCLUDED.appointment_time,
          appointment_location = EXCLUDED.appointment_location,
          call_status = EXCLUDED.call_status,
          call_count = EXCLUDED.call_count,  
          referring_physician_name = EXCLUDED.referring_physician_name,
          modality_name = EXCLUDED.modality_name,
          procedure_name = EXCLUDED.procedure_name,
          procedure_code = EXCLUDED.procedure_code,
          appointment_booked = EXCLUDED.appointment_booked,
          precision_center = EXCLUDED.precision_center,
          answers_to_screening_questions = EXCLUDED.answers_to_screening_questions,
          call_config = EXCLUDED.call_config,
          updated_at = EXCLUDED.updated_at
                `;

    try {
      await db.query(patientUpsertQuery, [
        patientId, // $1
        record.first_name || null, // $2
        record.last_name || null, // $3
        record.dob || null, // $4
        record.email || null, // $5
        record.phone || null, // $6
        record.address_street || null, // $7
        record.address_city || null, // $8
        record.zip_code || null, // $9
        record.insurance_id || null, // $10
        record.insurance_name || null, // $11
        record.insurance_verified || false, // $12
        record.appointment_type || null, // $13
        record.appointment_date || null, // $14
        record.appointment_time || null, // $15
        record.appointment_location || null, // $16
        record.call_status || "none", // $17
        parseInt(record.call_count || 0, 10), // $18
        createdAtTimestamp, // $19 - Explicitly set time of import
        record.referring_physician_name || null, // $20
        record.modality_name || null, // $21
        record.procedure_name || null, // $22
        record.procedure_code || null, // $23
        record.appointment_booked || false, // $24
        record.precision_center || null, // $25
        record.answers_to_screening_questions || null, // $26
        record.call_config || null, // $27
        updatedAtTimestamp, // $28
      ]);
      importedPatients++;

      // Schedule the callback logic
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
