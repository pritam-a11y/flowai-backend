const db = require("../db/connection"); 

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
    "updated_at", 
];

/**
 * Escape CSV values manually without any library.
 * This is the helper function provided in your request.
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
 * This is the core function provided in your request.
 */
function convertToCSV(rows, fields) {
    let csv = fields.join(",") + "\n"; // header row

    for (const row of rows) {
        // Ensure all required fields exist on the row object
        const line = fields.map((field) => escapeCSV(row[field])).join(",");
        csv += line + "\n";
    }

    return csv;
}

class DataService {
    /**
     * Fetches patient data updated within the given time window and generates a CSV.
     * @param {string} startTimeISO - Start time (ISO string, UTC)
     * @param {string} endTimeISO - End time (ISO string, UTC)
     * @returns {Object} {csvData: string, rowCount: number}
     */
    async fetchAndGenerateCSV(startTimeISO, endTimeISO) {
        const TARGET_TIMEZONE = process.env.TIMEZONE || "America/New_York";
        
        // This query fetches data updated within the time range
        const query = `
            SELECT 
                mrn, 
                first_name, last_name, 
                dob, zip_code, address_street, address_city, phone, email, 
                insurance_name, carrier_code, insurance_id, 
                referring_physician_name, modality_name, procedure_name, procedure_code, 
                booked_modality_name,
                -- Convert appointment date/time to the target timezone (EST) for the report
                CASE 
                    WHEN appointment_date IS NULL OR appointment_time IS NULL THEN ''
                    ELSE TO_CHAR(
                        (appointment_date::text || ' ' || appointment_time)::timestamp AT TIME ZONE 'UTC' AT TIME ZONE $3,
                        'YYYY-MM-DD'
                    ) 
                END AS appointment_date,
                CASE 
                    WHEN appointment_date IS NULL OR appointment_time IS NULL THEN ''
                    ELSE TO_CHAR(
                        (appointment_date::text || ' ' || appointment_time)::timestamp AT TIME ZONE 'UTC' AT TIME ZONE $3,
                        'HH24:MI:SS'
                    ) 
                END AS appointment_time,
                appointment_location, 
                appointment_booked, 
                reason,
                metallic_implant, 
                eye_fragments, 
                foreign_metallic_object, 
                claustrophobic, 
                human_transfer, 
                reason_for_transfer,
                updated_at
            FROM 
                patient_details
            WHERE 
                updated_at >= $1 AND updated_at < $2
            ORDER BY 
                updated_at ASC;
        `;

        const result = await db.query(query, [startTimeISO, endTimeISO, TARGET_TIMEZONE]);
        const records = result.rows;
        
        if (records.length === 0) {
            return { csvData: PATIENT_FIELDS.join(",") + "\n", rowCount: 0 };
        }
 
        const csvData = convertToCSV(records, PATIENT_FIELDS);

        return { csvData, rowCount: records.length };
    }
}

module.exports = DataService;