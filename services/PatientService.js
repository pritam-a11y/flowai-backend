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
                    insurance_name, insurance_id, insurance_verified,
                    appointment_type, appointment_date, appointment_time, call_status,
                    appointment_location, appointment_booked, precision_center,
                    referring_physician_name, modality_name, procedure_name, procedure_code,
                    answers_to_screening_questions,
                    call_count, call_config,
                    created_at, updated_at
                FROM patient_details
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
                // Basic Info
                fullName: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
                phone: row.phone,
                email: row.email,
                dateOfBirth: row.dob ? (row.dob instanceof Date ? row.dob.toISOString().split('T')[0] : row.dob) : '',
                zipCode: row.zip_code,
                address: [row.address_street, row.address_city, row.zip_code].filter(Boolean).join(', '),

                // Insurance Info
                insuranceName: row.insurance_name,
                insuranceMemberId: row.insurance_id,
                insuranceVerified: row.insurance_verified,

                // Medical Info (from Image 1)
                referringPhysician: row.referring_physician_name,
                modalityName: row.modality_name,
                procedureName: row.procedure_name,
                procedureCode: row.procedure_code,

                // Appointment Details - use modality_name as appointmentType
                appointmentType: row.modality_name || row.appointment_type,
                appointmentDate: row.appointment_date,
                appointmentTime: row.appointment_time,
                appointmentStatus: row.call_status,
                appointmentLocation: row.appointment_location,
                appointmentBooked: row.appointment_booked,
                precisionCenter: row.precision_center,

                // Screening
                screeningAnswers: row.answers_to_screening_questions,

                // Call Tracking
                callCount: row.call_count || 0,
                callConfig: row.call_config,

                // Timestamps
                createdAt: row.created_at,
                updatedAt: row.updated_at
            };

        } catch (error) {
            logger.error("Database error fetching patient data", { error: error.message, patientId });
            throw error;
        }
    }

    /**
     * Updates the call tracking statistics on the patient_details table.
     */
    async updateCallStats(patientId, newCallCount, callConfig = null) {
        logger.info("Updating patient call stats", { patientId, newCallCount });
        const query = `
             UPDATE patient_details
             SET call_count = $2,
                 call_config = COALESCE($3, call_config),
                 updated_at = NOW()
             WHERE patient_id = $1;
         `;
        try {
            await db.query(query, [patientId, newCallCount, callConfig]);
        } catch (error) {
            logger.error("Failed to update patient call stats", { patientId, error: error.message });
            throw error;
        }
    }

    /**
     * Updates the call tracking statistics on the patient_details table.
     */
    async newCallStats(patient_id, newStatus) {
        logger.info("Updating call status", { patient_id, newStatus });
        const query = `
             UPDATE patient_details
             SET call_status = $2,
             updated_at = NOW()
             WHERE patient_id = $1;
         `;
        try {
            await db.query(query, [patient_id, newStatus]);
        } catch (error) {
            logger.error("Failed to update patient call stats", { patientId, error: error.message });
            throw error;
        }
    }
    
    

    /**
     * Updates screening answers after call completion
     */
    async updateScreeningAnswers(patientId, customData) {

        const patient_id =  customData.patient_id

        logger.info("Updating screening answers", { patient_id });
       
         // Map the mri_q keys to the full question and corresponding boolean answer
         const screeningQuestions = {
            "1. Do you have metallic implant or devices in the body?":
              customData.mri_q1,
            "2. Is there any chance you have metallic fragments in the eye?":
              customData.mri_q2,
            "3. Do you have any foreign metallic object in the body like bullet, BB, etc?":
              customData.mri_q3,
            "4. Are you claustrophobic?": customData.mri_q4,
          };

          const screeningAnswers = JSON.stringify(screeningQuestions);
                     const query = `
        UPDATE patient_details
        SET
            human_transfer = $2,              
            booked_modality_name = $3,
            reason = $4,
            reason_for_transfer = $5,
            metallic_implant = $6,           
            eye_fragments = $7,              
            foreign_metallic_object = $8,    
            claustrophobic = $9,             
            answers_to_screening_questions = $10,
            updated_at = NOW()
        WHERE
            patient_id = $1;
    `; 

    const values = [
        customData.patient_id,            // $1: WHERE clause
        customData.is_transfer_attempted, // $2: maps to human_transfer
        customData.booked_modality_name,  // $3: maps to booked_modality_name
        customData.reason,                // $4: maps to reason
        customData.reason_for_transfer,   // $5: maps to reason_for_transfer
        customData.mri_q1,                // $6: maps to metallic_implant
        customData.mri_q2,                // $7: maps to eye_fragments
        customData.mri_q3,                // $8: maps to foreign_metallic_object
        customData.mri_q4,                // $9: maps to claustrophobic
        screeningAnswers                  // $10: maps to answers_to_screening_questions (JSON string)
    ];

        try {
            await db.query(query, values);
        } catch (error) {
            logger.error("Failed to update screening answers", { patientId, error: error.message });
            throw error;
        }
    }

    /**
     * Updates appointment booking status with precision center
     */
    async updateAppointmentBooking(patientId, appointmentData) {
        logger.info("Updating appointment booking", { patientId, appointmentData });
        const query = `
            UPDATE patient_details
            SET appointment_booked = TRUE,
                appointment_date = $2,
                appointment_time = $3,
                appointment_type = $4,
                appointment_location = $5,
                precision_center = $6,
                call_status = 'booked',
                updated_at = NOW()
            WHERE patient_id = $1;
        `;
        try {
            await db.query(query, [
                patientId,
                appointmentData.date,
                appointmentData.time,
                appointmentData.type,
                appointmentData.location,
                appointmentData.precisionCenter
            ]);
        } catch (error) {
            logger.error("Failed to update appointment booking", { patientId, error: error.message });
            throw error;
        }
    }
}

module.exports = PatientService;