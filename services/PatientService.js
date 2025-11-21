const db = require("../db/connection");
const logger = require("../utils/logger");

class PatientService {
    /**
     * Fetches comprehensive patient details from the 'patients' table.
     * @param {string} patientId - The unique ID of the patient.
     * @returns {Promise<Object|null>} Patient data object or null if not found.
     */
    async getPatientData(patientId) {
        logger.info("Fetching patient data from DB", { patientId });
        try {
            const query = `
                SELECT 
                    first_name, last_name, phone, email, dob, 
                    zip_code, address_street, address_city, 
                    insurance_name, insurance_id, 
                    appointment_type, appointment_date, appointment_time, appointment_status
                FROM public.patients 
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
            };

        } catch (error) {
            logger.error("Database error fetching patient data", { error: error.message, patientId });
            throw error;
        }
    }
}

module.exports = PatientService;