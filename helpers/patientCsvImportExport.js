const { v4: uuidv4 } = require("uuid");  
const db = require('../db/connection');  
const logger = require('../utils/logger');  
const csv = require('csv-stringify');
const moment = require('moment-timezone');
const CallbackService = require("../services/callbackServices");

const callbackService = new CallbackService();

/**
 * Helper function to format the current local date as YYYY-MM-DD.
 * @returns {string} The current date string.
 */
const getTodayDateString = () => {
    const now = new Date();
    const year = now.getFullYear();
    // Month is 0-indexed, so add 1. Use padStart for 2 digits.
    const month = String(now.getMonth() + 1).padStart(2, '0'); 
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Define the canonical list of patient fields for standardization. 
const PATIENT_FIELDS = [
    'patient_id',
    'first_name',
    'last_name',
    'dob',
    'email',
    'phone',  
    'address_street',
    'address_city',
    'zip_code',
    'insurance_id',
    'insurance_name',
    'insurance_verified',
    'appointment_type',
    'appointment_date',
    'appointment_time',
    'appointment_location',
    'appointment_status',
    'call_count', 
    'created_at'
];

/**
 * Retrieves and filters patient data for export, including only future or current appointments.
 * @returns {Promise<string>} CSV content string.
 */
async function exportPatientData() {
    logger.info('Starting patient data export process...');
    try {
        // Get today's date using native JS (YYYY-MM-DD format).
        const todayDate = getTodayDateString();
        
        // SQL query to fetch data where appointment_date is today or in the future
        // This is the required filter logic (appointment_date >= $1)
        const query = `
            SELECT 
                patient_id, first_name, last_name, dob, email, phone, 
                address_street, address_city, zip_code, insurance_id, 
                insurance_name, insurance_verified, appointment_type, 
                appointment_date, appointment_time, appointment_location, 
                appointment_status, created_at
            FROM public.patients
            WHERE appointment_date >= $1
            ORDER BY appointment_date ASC, appointment_time ASC
        `;
        
        const result = await db.query(query, [todayDate]);
        const records = result.rows;

        if (records.length === 0) {
            logger.warn('No future or current patient appointments found for export.');
            // Return CSV headers only if no data
            return PATIENT_FIELDS.join(',') + '\n';
        }

        // Use csv-stringify to convert array of objects to CSV string
        const csvContent = await new Promise((resolve, reject) => {
            csv.stringify(records, { header: true, columns: PATIENT_FIELDS }, (err, output) => {
                if (err) return reject(err);
                resolve(output);
            });
        });

        logger.info(`Successfully exported ${records.length} future patient records.`);
        return csvContent;
    } catch (error) {
        logger.error('Database error during patient data export:', error.message);
        throw new Error('Failed to retrieve and format patient data for export.');
    }
}

/**
 * Standardizes and imports an array of patient records, performing an upsert operation.
 * This function now contains the concrete database insertion logic, replacing the placeholder.
 * @param {Array<Object>} records - Array of patient records to import.
 * @returns {Promise<Object>} Summary of the import process.
 */
async function importPatientData(records) {
    logger.info(`Starting patient data import for ${records.length} records...`);
    
    let importedPatients = 0; 

    for (const record of records) {
        // Use the existing patient_id or generate a new UUID
        const patientId = record.patient_id || uuidv4();
        
        // --- Manual Timestamp Creation: Always uses native JavaScript Date ---
        const createdAtTimestamp = new Date().toISOString(); 
        
        // --- Patient Upsert Logic (Handling all fields) --- 
        // This fully implements the database operation.
        const patientUpsertQuery = `
            INSERT INTO public.patients (
                patient_id, first_name, last_name, dob, email, phone, 
                address_street, address_city, zip_code, insurance_id, 
                insurance_name, insurance_verified, appointment_type, 
                appointment_date, appointment_time, appointment_location,
                appointment_status, call_count, created_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 
                $14, $15, $16, $17, $18, $19,
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
                appointment_status = EXCLUDED.appointment_status,
                call_count = EXCLUDED.call_count, 
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
                record.appointment_status || 'none', // $17
                parseInt(record.call_count || 0, 10), // $18 
                createdAtTimestamp, // $19 - Explicitly set time of import
            ]);
            importedPatients++;

              // Calculate the scheduled time (using the current time as the "failed at" time)
              const scheduledCallbackTime = callbackService.calculateScheduledTime(createdAtTimestamp);
            
              // Schedule the callback
              const agentCallbackNumber = process.env.DEFAULT_AGENT_CALLBACK_NUMBER || null;
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
        message: `Patient data upsert complete. Imported/Updated ${importedPatients} records.`
    };
}

module.exports = {
    exportPatientData,
    importPatientData
};