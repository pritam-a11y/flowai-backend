const db = require("../db/connection");
const logger = require("../utils/logger");

async function updatePatientAppointmentLocation(call) {
    
    const patient_data = call?.call_analysis?.custom_analysis_data;

    // --- Extract and Validate Input Data ---
    const appointment_location = patient_data?.appointment_location || '';
    const patient_first_name = patient_data?.patient_first_name || '';
    const patient_email = patient_data?.patient_email || '';
    const appointment_date = patient_data?.appointment_date || '';
    const appointment_time = patient_data?.appointment_time || '';

    if (!patient_first_name || !appointment_date || !appointment_time) {
        logger.warn(
            'Missing mandatory fields (first_name, date, or time) for patient lookup.',
            { patient_data }
        );
        return;
    }

    logger.info(`Attempting to find and update location for: ${patient_first_name} on ${appointment_date} at ${appointment_time}`);

    try {
        // --- Check Database for Matching Patient ---
        // Checks: first_name = $1 AND appointment_date = $2 AND appointment_time = $3
        // Conditional Check: AND (email = $4 OR $4 = '') 
        const checkPatientQuery = `
            SELECT patient_id
            FROM patient_details
            WHERE 
                first_name = $1
                AND appointment_date = $2
                AND appointment_time = $3
                AND (email = $4 OR $4 = '')
        `;

        const checkResult = await db.query(checkPatientQuery, [
            patient_first_name, 
            appointment_date, 
            appointment_time, 
            patient_email
        ]);

        // --- Process Check Result ---
        if (checkResult.rows.length === 1) {
            const patientId = checkResult.rows[0].patient_id; 
            logger.info(`Match found. Patient ID: ${patientId}. Checking for location to update.`);

            // --- Perform Update if Location is Provided ---
            if (appointment_location) {
                const updateLocationQuery = `
                    UPDATE patient_details 
                    SET 
                        appointment_location = $2
                    WHERE 
                        patient_id = $1
                    RETURNING patient_id;
                `;
                 await db.query(updateLocationQuery, [patientId, appointment_location]);
                 
                 logger.info(`SUCCESS: Updated appointment_location for Patient ID: ${patientId} to ${appointment_location}.`);
            } else {
                 logger.warn(`Skipped update: appointment_location is missing for Patient ID: ${patientId}.`);
            }
        } else if (checkResult.rows.length > 1) {
            logger.error(`Multiple patient records found (${checkResult.rows.length}) for the criteria. No update performed.`, { criteria: { name: patient_first_name, date: appointment_date, time: appointment_time } });
        } else {
            logger.warn(`No matching patient record found. No update performed.`);
        }
    } catch (error) {
        logger.error('Database query failed during patient check or update.', { error: error.message, stack: error.stack }); 
    }
}

module.exports = { updatePatientAppointmentLocation }