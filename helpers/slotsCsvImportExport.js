const { v4: uuidv4 } = require("uuid");
const db = require("../db/connection");
const logger = require("../utils/logger");

/**
 * Converts an array of JavaScript objects into a basic CSV string.
 * @param {Array<Object>} data The data array to convert.
 * @returns {string} The CSV formatted string.
 */
function toCsv(data) {
    if (!data || data.length === 0) {
        return "";
    }

    // Use keys from the first object to define headers
    const headers = Object.keys(data[0]);
    const csvRows = [];
    
    // Add headers
    csvRows.push(headers.join(','));

    // Add rows
    for (const row of data) {
        const values = headers.map(header => {
            const value = row[header] === null || row[header] === undefined ? '' : row[header];
            // Simple CSV sanitation: escape quotes and wrap in quotes if necessary
            const safeValue = String(value).replace(/"/g, '""');
            // Check if wrapping in quotes is needed (contains comma, quote, or newline)
            return safeValue.includes(',') || safeValue.includes('"') || safeValue.includes('\n')
                ? `"${safeValue}"`
                : safeValue;
        });
        csvRows.push(values.join(','));
    }

    return csvRows.join('\n');
}

/**
 * Imports slot data from a list of records.
 * It performs an upsert, generating a new slot_id (UUID) if missing.
 * @param {Array<Object>} csvRecords An array of objects parsed from a CSV file.
 * @returns {Promise<Object>} Summary of imported data.
 */
async function importSlotData(csvRecords) {
    let importedSlots = 0;
    
    logger.info(`Starting slot data import for ${csvRecords.length} records.`);
    
    for (const record of csvRecords) {
        const slotId = record.slot_id || uuidv4();
        
        // --- Manual Timestamp Creation: Always uses the time of import (UTC ISO 8601) ---
        const createdAtTimestamp = new Date().toISOString(); 
        
        // --- Slot Upsert Logic (Handling all fields) ---
        const slotUpsertQuery = `
            INSERT INTO public.slots (
                slot_id, 
                start_time, 
                end_time, 
                day_of_week, 
                service_type,
                status,
                created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (slot_id) DO UPDATE 
            SET start_time = EXCLUDED.start_time,
                end_time = EXCLUDED.end_time,
                day_of_week = EXCLUDED.day_of_week,
                service_type = EXCLUDED.service_type,
                status = EXCLUDED.status;
        `;
        
        try {
            await db.query(slotUpsertQuery, [
                slotId, // $1
                record.start_time ? new Date(record.start_time).toISOString() : null, // $2 (ISO 8601)
                record.end_time ? new Date(record.end_time).toISOString() : null, // $3 (ISO 8601)
                record.day_of_week || 'N/A', // $4
                record.service_type || 'General Checkup', // $5
                record.slot_status || 'available', // $6
                createdAtTimestamp, // $7 - Explicitly set time of import
            ]);
            importedSlots++;
        } catch (error) {
            logger.error(`Failed to upsert slot ${slotId}: ${error.message}`);
        }
    }

    return {
        totalRecords: csvRecords.length,
        slotsImported: importedSlots,
    };
}

/**
 * Exports all slot data.
 * @returns {Promise<string>} The CSV file content as a string.
 */
async function exportSlotData() {
    logger.info("Starting slot data export.");

    const exportQuery = `
        SELECT
            slot_id, 
            start_time, 
            end_time, 
            day_of_week, 
            service_type,
            status,
            created_at
        FROM public.slots
        ORDER BY start_time;
    `;
    
    const result = await db.query(exportQuery);
    
    if (result.rows.length === 0) {
        return toCsv([{ slot_id: 'No Data Found' }]);
    }

    const csvContent = toCsv(result.rows);
    return csvContent;
}

module.exports = {
    importSlotData,
    exportSlotData
};