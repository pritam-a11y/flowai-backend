const { v4: uuidv4 } = require("uuid");
const db = require("../db/connection");
const logger = require("../utils/logger");
const CallbackService = require("../services/callbackServices");
const AdmZip = require("adm-zip");

const callbackService = new CallbackService();

const TARGET_TIMEZONE = "America/New_York";
const CSV_PASSWORD = "FlowAi";

const PATIENT_FIELDS = [
  "MRN",
  "First Name",
  "Last Name",
  "DOB",
  "Zip Code",
  "Address Street",
  "Address City",
  "Phone",
  "Email",
  "Insurance Name",
  "Insurance Id",
  "Referring Physician Name",
  "Modality Name",
  "Procedure Name",
  "Procedure Code",
  "Appointment Booked",
  "Reason",
  "Booked Modality Name",
  "Appointment Date",
  "Appointment Time",
  "Appointment Location",
  "Metallic Implant A",
  "Metallic Implant B",
  "Eye Fragments A",
  "Eye Fragments B",
  "Foreign Bodies A",
  "Foreign Bodies B",
  "Claustrophobic",
  "Human Transfer",
  "Reason for Transfer",
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
    // Ensure field names match the PATIENT_FIELDS array exactly
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
        mrn AS "MRN",
        first_name AS "First Name", 
        last_name AS "Last Name", 
        dob AS "DOB",
        zip_code AS "Zip Code", 
        address_street AS "Address Street", 
        address_city AS "Address City", 
        phone AS "Phone", 
        email AS "Email",
        insurance_name AS "Insurance Name",  
        insurance_id AS "Insurance Id", -- Assuming only one ID is needed
        referring_physician_name AS "Referring Physician Name", 
        modality_name AS "Modality Name", 
        procedure_name AS "Procedure Name", 
        procedure_code AS "Procedure Code",
        booked_modality_name AS "Booked Modality Name",
        
        CASE
            WHEN appointment_date IS NULL OR appointment_time IS NULL THEN ''
            ELSE TO_CHAR(
                (appointment_date::text || ' ' || appointment_time)::timestamp AT TIME ZONE 'UTC' AT TIME ZONE $1,
                'YYYY-MM-DD'
            )
        END AS "Appointment Date",
        CASE
            WHEN appointment_date IS NULL OR appointment_time IS NULL THEN ''
            ELSE TO_CHAR(
                (appointment_date::text || ' ' || appointment_time)::timestamp AT TIME ZONE 'UTC' AT TIME ZONE $1,
                'HH24:MI:SS'
            )
        END AS "Appointment Time",
        appointment_location AS "Appointment Location",  
        CASE WHEN appointment_booked = TRUE THEN 'Yes' ELSE 'No' END AS "Appointment Booked",
        
        reason AS "Reason", 

        -- A Columns (Boolean, converted to Yes/No)
        CASE WHEN is_metallic_implant = TRUE THEN 'Yes' ELSE 'No' END AS "Metallic Implant A",
        CASE WHEN is_eye_fragments = TRUE THEN 'Yes' ELSE 'No' END AS "Eye Fragments A",
        CASE WHEN is_foreign_bodies = TRUE THEN 'Yes' ELSE 'No' END AS "Foreign Bodies A",
        
        -- B Columns (Text Reason, cleaned up to remove literal booleans)
        CASE 
            WHEN metallic_implant IS NULL OR LOWER(TRIM(metallic_implant::text)) IN ('true', 'false', 'null', '') 
            THEN '' 
            ELSE metallic_implant 
        END AS "Metallic Implant B",
        
        CASE 
            WHEN eye_fragments IS NULL OR LOWER(TRIM(eye_fragments::text)) IN ('true', 'false', 'null', '') 
            THEN '' 
            ELSE eye_fragments 
        END AS "Eye Fragments B",
         
        CASE 
            WHEN foreign_metallic_object IS NULL OR LOWER(TRIM(foreign_metallic_object::text)) IN ('true', 'false', 'null', '') 
            THEN '' 
            ELSE foreign_metallic_object 
        END AS "Foreign Bodies B",
        
        -- Other Boolean fields
        CASE WHEN claustrophobic = TRUE THEN 'Yes' ELSE 'No' END AS "Claustrophobic",
        CASE WHEN human_transfer = TRUE THEN 'Yes' ELSE 'No' END AS "Human Transfer",
        
        reason_for_transfer AS "Reason for Transfer"
    FROM patient_details
    WHERE
        (
            appointment_booked = TRUE OR
            LOWER(call_status) IN ('dropped', 'booked')
        ) AND
        ( 
            appointment_date IS NULL OR
            appointment_time IS NULL OR
            (appointment_date::text || ' ' || appointment_time)::timestamp AT TIME ZONE 'UTC' AT TIME ZONE $1 >= NOW() AT TIME ZONE $1
        )
        OR 
        (reason IS NOT NULL AND TRIM(reason) != '') OR
        (reason_for_transfer IS NOT NULL AND TRIM(reason_for_transfer) != '')
        OR
        ( 
            -- Screening filter: Check if A or B columns contain meaningful data (based on request)
            (is_metallic_implant = TRUE OR is_metallic_implant = FALSE) OR -- Check new boolean flag
            (is_eye_fragments = TRUE OR is_eye_fragments = FALSE) OR 
            (is_foreign_bodies = TRUE OR is_foreign_bodies = FALSE) OR 
            (claustrophobic = TRUE) OR (claustrophobic = FALSE) -- Check claustrophobia
        )
    ORDER BY
        "Appointment Date" ASC NULLS LAST,
        "Appointment Time" ASC NULLS LAST
        `;

    const result = await db.query(query, [TARGET_TIMEZONE]);
    const records = result.rows;

    if (records.length === 0) {
      logger.warn("No patient appointments found for export.");
      return PATIENT_FIELDS.join(",") + "\n";
    }

    const csvContent = convertToCSV(records, PATIENT_FIELDS);

    // --- ZIP and PASSWORD PROTECTION LOGIC ---
    const zip = new AdmZip();
    const csvFileName = `patient_report_${getTodayDateString()}.csv`;
    const zipFileName = `secure_patient_data_future_${getTodayDateString()}.zip`;

    // Add the CSV data to the ZIP with password protection
    zip.addFile(csvFileName, Buffer.from(csvContent, "utf8"), "", CSV_PASSWORD);

    const zipBuffer = zip.toBuffer();
    // ----------------------------------------

    logger.info(
      `Successfully created password-protected ZIP file with ${records.length} records. Password: ${CSV_PASSWORD}`
    );
    
    logger.info(`Successfully exported ${records.length} records.`);
 
    return { zipBuffer, fileName: zipFileName }; 
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
      "MRN",
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
    ];

    // Build the parameter array based on the importedFields list
    const params = [
      patientId, // $1
      record.mrn,
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
