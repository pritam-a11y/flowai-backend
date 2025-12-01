const { v4: uuidv4 } = require("uuid");
const db = require("../db/connection");
const logger = require("../utils/logger");

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
            INSERT INTO slots (
                slot_id, 
                start_time, 
                end_time, 
                day_of_week, 
                service_type,
                status,
                created_at,
                location,
                time_period
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (slot_id) DO UPDATE 
            SET start_time = EXCLUDED.start_time,
                end_time = EXCLUDED.end_time,
                day_of_week = EXCLUDED.day_of_week,
                service_type = EXCLUDED.service_type,
                status = EXCLUDED.status,
                location = EXCLUDED.location,
                time_period = EXCLUDED.time_period;
        `;

    try {
      await db.query(slotUpsertQuery, [
        slotId, // $1
        record.start_time ? new Date(record.start_time).toISOString() : null, // $2 (ISO 8601)
        record.end_time ? new Date(record.end_time).toISOString() : null, // $3 (ISO 8601)
        record.day_of_week || "N/A", // $4
        record.service_type || "General Checkup", // $5
        record.slot_status || "available", // $6
        createdAtTimestamp, // $7 - Explicitly set time of import
        record.location || "N/A", // $8
        record.time_period || "N/A", // $9
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

module.exports = {
  importSlotData,
};
