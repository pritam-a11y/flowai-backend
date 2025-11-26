const db = require("../db/connection");
const logger = require("../utils/logger");

class PatientService {
    /**
     * Fetches comprehensive patient details including call tracking stats.
     */
    async getPatientData(patientId) {
        logger.info("Fetching patient data from DB", { patientId });
        try {
            const query = `
                SELECT 
                    first_name, last_name, phone, email, dob, 
                    zip_code, address_street, address_city, 
                    insurance_name, insurance_id, 
                    appointment_type, appointment_date, appointment_time, appointment_status, 
                    call_count, call_config 
                FROM patients 
                WHERE patient_id = $1 
                LIMIT 1;
            `;
            const result = await db.query(query, [patientId]);

            if (result.rows.length === 0) {
                return null;
            }

            const row = result.rows[0];

            // Map the flat DB row to a structured object for use in the scheduler
            return {
                fullName: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
                phone: row.phone,
                email: row.email,
                dateOfBirth: row.dob ? row.dob.toISOString().split('T')[0] : '',
                zipCode: row.zip_code,
                address: `${row.address_street || ''}, ${row.address_city || ''}`.trim(),
                insuranceName: row.insurance_name,
                insuranceMemberId: row.insurance_id,

                // Active Appointment Details 
                appointmentType: row.appointment_type,
                appointmentDate: row.appointment_date,
                appointmentTime: row.appointment_time,
                appointmentStatus: row.appointment_status,

                // Call Tracking Stats
                call_count: row.call_count || 0,
                call_config: row.call_config, // JSON string
            };

        } catch (error) {
            logger.error("Database error fetching patient data", { error: error.message, patientId });
            throw error;
        }
    }

    /**
     * Updates the call tracking statistics on the patients table.
     */
    async updateCallStats(patientId, newCallCount, newCallConfigJson) {
        logger.info("Updating patient call stats", { patientId, newCallCount });
        const query = `
             UPDATE patients
             SET 
                 call_count = $2,
                 call_config = $3,
                 updated_at = CURRENT_TIMESTAMP 
             WHERE patient_id = $1;
         `;
        try {
            await db.query(query, [patientId, newCallCount, newCallConfigJson]);
        } catch (error) {
            logger.error("Failed to update patient call stats", { patientId, error: error.message });
            throw error;
        }
    }
}

module.exports = PatientService;