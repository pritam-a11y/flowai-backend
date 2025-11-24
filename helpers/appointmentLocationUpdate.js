const db = require("../db/connection");
const logger = require("../utils/logger");

async function updatePatientAppointmentLocation(call, callIdToPatientIdMap) {
    
    const callId = call?.call_id;
    const patient_data = call?.call_analysis?.custom_analysis_data;

    // --- Retrieve patientId from the Map using callId ---
    const patientId = callIdToPatientIdMap.get(callId);
    const appointment_location = patient_data?.appointment_location;

    if (!patientId) {
        logger.warn(`Failed to update location: No patientId found in map for call_id: ${callId}.`);
        return { success: false, error: "Patient ID not mapped for this call session." };
    }
    
    if (!appointment_location) {
        logger.warn(`Skipped update: appointment_location is missing for call_id: ${callId}.`);
        return { success: false, error: "Appointment location data is missing." };
    }

    logger.info(`Updating location for mapped Patient ID: ${patientId} (via call_id: ${callId})`);

    try {
        // --- Perform Update (No SELECT/Check needed) ---
        const updateLocationQuery = `
            UPDATE patient_details 
            SET 
                appointment_location = $2
            WHERE 
                patient_id = $1
            RETURNING patient_id;
        `;
        
        await db.query(updateLocationQuery, [patientId, appointment_location]);
        
        // --- Clean up the Map ---
        callIdToPatientIdMap.delete(callId);
        logger.info(`SUCCESS: Updated location for Patient ID: ${patientId} and removed entry from map.`);
        
        return { success: true, patientId, location: appointment_location };

    } catch (error) {
        logger.error('Database query failed during patient location update.', { error: error.message, stack: error.stack }); 
        return { success: false, error: "Database error during location update." };
    }
}

module.exports = { updatePatientAppointmentLocation }