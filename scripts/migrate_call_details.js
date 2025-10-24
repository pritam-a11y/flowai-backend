require("dotenv").config();
const db = require("../db/connection");
const logger = require("../utils/logger");
const {
  extractCallDetailsForUpdate,
} = require("../utils/transformCallDetails");


async function migrateCallDetails() {
  logger.info("Starting call details migration to new columns...");
  let client;

  try { 
    // We use IS NULL as a flag to process only calls that haven't been migrated yet.
    const fetchQuery = "SELECT call_id, body FROM calls WHERE latency_stt_p99 IS NULL;";
    // Use the exported db.query for simple fetch
    const { rows } = await db.query(fetchQuery);

    logger.info(`Found ${rows.length} records to process.`);

    if (rows.length === 0) {
      logger.info("No unmigrated records found. Exiting.");
      return;
    }

    // 2. Begin Transaction for safety
    // Use pool.connect() to get a client for transaction control
    client = await db.pool.connect();
    await client.query("BEGIN");

    // 3. Define the UPDATE statement
    const updateQuery = `
            UPDATE calls
            SET
                total_duration_seconds = $1,
                latency_e2e_p50 = $2,
                latency_e2e_p99 = $3,
                latency_llm_p50 = $4,
                latency_llm_p99 = $5,
                latency_tts_p50 = $6,
                latency_tts_p99 = $7,
                latency_stt_p50 = $8,
                latency_stt_p99 = $9,
                agent_name = $10,
                agent_id = $11,
                call_successful = $12,
                custom_analysis_data = $13,
                direction = $14,
                call_type = $15,
                disconnection_reason = $16,
                user_sentiment = $17,
                in_voicemail = $18,
                date = $19,
                retell_llm_dynamic_variables = $20,
                org_id = $21
            WHERE call_id = $22;
        `;

    // 4. Loop, Extract, and Update
    let updatedCount = 0;
    for (const row of rows) {
      let bodyJson;
      try {
        // Safely parse the JSON body
        bodyJson =
          typeof row.body === "string" ? JSON.parse(row.body) : row.body;
      } catch (e) {
        logger.error(
          `Skipping call_id ${row.call_id}: Failed to parse JSON body.`,
          { error: e.message }
        );
        continue;
      }

      // Extract the data using the utility function
      const extractedData = extractCallDetailsForUpdate(bodyJson);

      // Create an array of values matching the $1 through $19 parameters
      const values = [
        extractedData.total_duration_seconds,
        extractedData.latency_e2e_p50,
        extractedData.latency_e2e_p99,
        extractedData.latency_llm_p50,
        extractedData.latency_llm_p99,
        extractedData.latency_tts_p50,
        extractedData.latency_tts_p99,
        extractedData.latency_stt_p50,
        extractedData.latency_stt_p99,
        extractedData.agent_name,
        extractedData.agent_id,
        extractedData.call_successful,
        extractedData.custom_analysis_data, // JSONB data type handles the object
        extractedData.direction,
        extractedData.call_type,
        extractedData.disconnection_reason,
        extractedData.user_sentiment,
        extractedData.in_voicemail,
        extractedData.date, // $19
        extractedData.retell_llm_dynamic_variables, // $20
        extractedData.org_id, // $21 (Hardcoded to 3)
        extractedData.call_id, // $22 is the call_id for the WHERE clause
      ];

      // Use the client.query() inside the transaction
      await client.query(updateQuery, values);
      updatedCount++;
    }

    // 5. Commit the transaction
    await client.query("COMMIT");
    logger.info(
      `Migration complete. Successfully updated ${updatedCount} records.`
    );
  } catch (error) {
    logger.error("Migration failed. Rolling back transaction.", {
      error: error.message,
      stack: error.stack,
    });
    // Rollback on any error
    if (client) {
      await client.query("ROLLBACK");
    }
    throw error;
  } finally {
    // 6. Release the client back to the pool
    if (client) {
      client.release();
    }
  }
}

migrateCallDetails().catch((err) => {
  logger.error("Fatal error during migration:", { message: err.message });
  process.exit(1);
});
