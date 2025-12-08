const db = require("../db/connection"); 

//const CSV_PASSWORD = process.env.CSV_PASSWORD || "FlowAi";

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
  let csv = fields.join(",") + "\n";

  for (const row of rows) {
    const line = fields.map((field) => escapeCSV(row[field])).join(",");
    csv += line + "\n";
  }

  return csv;
}

class DataService {
  /**
   * Fetches patient data updated within the given time window and applies all business logic filters.
   * @param {string} startTimeISO - Start time (ISO string, UTC)
   * @param {string} endTimeISO - End time (ISO string, UTC)
   * @returns {Object} {csvData: string, rowCount: number}
   */
  async fetchAndGenerateCSV(startTimeISO, endTimeISO) {
    const TARGET_TIMEZONE = process.env.TIMEZONE || "America/New_York";

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
  insurance_id AS "Insurance Id",
  referring_physician_name AS "Referring Physician Name", 
  modality_name AS "Modality Name", 
  procedure_name AS "Procedure Name", 
  procedure_code AS "Procedure Code",
  
  CASE WHEN appointment_booked = TRUE THEN 'Yes' ELSE 'No' END AS "Appointment Booked", 
  
  reason AS "Reason",
  booked_modality_name AS "Booked Modality Name",
  
  -- Date/Time formatting (aliases corrected to match PATIENT_FIELDS)
  CASE 
    WHEN appointment_date IS NULL OR TRIM(appointment_date::text) IN ('', 'null', '[null]') OR appointment_time IS NULL OR TRIM(appointment_time::text) IN ('', 'null', '[null]')
    THEN ''
    ELSE TO_CHAR(
      (appointment_date::text || ' ' || NULLIF(REPLACE(appointment_time::text, '[null]', ''), ''))::timestamp AT TIME ZONE 'UTC' AT TIME ZONE $3,
      'YYYY-MM-DD'
    )
  END AS "Appointment Date",

  CASE 
    WHEN appointment_date IS NULL OR TRIM(appointment_date::text) IN ('', 'null', '[null]') OR appointment_time IS NULL OR TRIM(appointment_time::text) IN ('', 'null', '[null]')
    THEN ''
    ELSE TO_CHAR(
      (appointment_date::text || ' ' || NULLIF(REPLACE(appointment_time::text, '[null]', ''), ''))::timestamp AT TIME ZONE 'UTC' AT TIME ZONE $3,
      'HH24:MI:SS'
    )
  END AS "Appointment Time",

  appointment_location AS "Appointment Location",
  
  -- A-Columns (Boolean, 'Yes'/'No')
  CASE WHEN is_metallic_implant = TRUE THEN 'Yes' ELSE 'No' END AS "Metallic Implant A",
  CASE WHEN is_eye_fragments = TRUE THEN 'Yes' ELSE 'No' END AS "Eye Fragments A",  
  CASE WHEN is_foreign_bodies = TRUE THEN 'Yes' ELSE 'No' END AS "Foreign Bodies A",
  
  -- B-Columns (Text Reason, cleaning up 'true'/'false' values)
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
  
FROM 
  patient_details
WHERE 
  updated_at >= $1 AND updated_at < $2 
AND
( 
  -- Standard booking/call status logic
  appointment_booked = TRUE OR
  LOWER(call_status) IN ('dropped', 'booked') OR
  ( 
    appointment_date IS NULL OR
    appointment_time IS NULL OR
    (
      (
        appointment_date::text || ' ' || 
        NULLIF(REPLACE(appointment_time::text, '[null]', ''), '') 
      )
    )::timestamp AT TIME ZONE 'UTC' AT TIME ZONE $3 >= NOW() AT TIME ZONE $3
  )
)
OR 
  (reason IS NOT NULL AND TRIM(reason) != '') OR
  (reason_for_transfer IS NOT NULL AND TRIM(reason_for_transfer) != '')
  OR
( 
  -- Screening filter: Check for the presence of the new boolean flags or claustrophobia
  (is_metallic_implant = TRUE OR is_metallic_implant = FALSE) OR
  (is_eye_fragments = TRUE OR is_eye_fragments = FALSE) OR 
  (is_foreign_bodies = TRUE OR is_foreign_bodies = FALSE) OR
  (claustrophobic = TRUE) OR (claustrophobic = FALSE)
)
ORDER BY 
updated_at ASC;
`;

    // Pass only the timezone parameter
    const result = await db.query(query, [
      startTimeISO,
      endTimeISO,
      TARGET_TIMEZONE,
    ]);
    const records = result.rows;

    if (records.length === 0) {
      return { csvData: PATIENT_FIELDS.join(",") + "\n", rowCount: 0 };
    }

    const csvData = convertToCSV(records, PATIENT_FIELDS);

    return { csvData, rowCount: records.length };
  }
}

module.exports = DataService;
