const db = require("../db/connection");
const logger = require("../utils/logger");
const moment = require("moment-timezone");
const { v4: uuidv4 } = require("uuid");
const patientService = require("./PatientService");

const CALLBACK_ATTEMPT_INTERVALS = {
  1: 5, // After call #1 (Initial or retry), schedule call #2 after 5 minutes.
  2: 2880, // After call #2, schedule call #3 after 48 hours (2880 minutes).
  3: 5, // After call #3, schedule call #4 after 5 minutes.
};

class CallbackService {
  /**
   * Inserts a new callback entry into the scheduled_callbacks table.
   */
  async scheduleCallback(
    patientId,
    agentCallbackNumber,
    scheduledTime,
    reason,
    status = "pending"
  ) {
    const createdAt = new Date().toISOString();

    logger.info("Scheduling new callback entry (Initial Call).", {
      patientId,
      scheduledTime,
      reason,
      createdAt,
    });

    const insertQuery = `
        INSERT INTO scheduled_callbacks
             (patient_id, agent_callback_number, scheduled_time, callback_reason, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id;
        `;

    try {
      const result = await db.query(insertQuery, [
        patientId,
        agentCallbackNumber,
        scheduledTime,
        reason,
        status,
        createdAt,
      ]);

      const callbackId = result.rows[0].id;
      logger.info("Callback scheduled successfully.", { callbackId });
      return callbackId;
    } catch (error) {
      logger.error("Failed to insert callback into database", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Calculates the next scheduled time for a callback retry based on the sequence.
   * @param {number} currentCallCount - The total number of calls made *so far*.
   * @returns {string} The ISO string of the next scheduled time.
   */
  calculateNextRetryTime(currentCallCount) {
    // Use the current call count as the key to look up the delay for the NEXT attempt.
    const intervalKey = currentCallCount;

    // Default to 5 minutes if the attempt key is not explicitly defined.
    const intervalMinutes = CALLBACK_ATTEMPT_INTERVALS[intervalKey] || 5;

    logger.info("Calculating next retry time.", {
      currentCallCount,
      intervalMinutes,
    });

    return moment().add(intervalMinutes, "minutes").toISOString();
  }

  /**
   * Reschedules a callback and updates patient call stats after an unanswered call.
   */
  async handleUnansweredCallback(callbackId, patientId) {
    const patientData = await patientService.getPatientData(patientId);
    if (!patientData) {
      logger.error("Patient not found for unanswered callback retry.", {
        callbackId,
        patientId,
      });
      return;
    }

    const currentCallCount = patientData.call_count || 0;
    const patientCallAttempts = patientData.call_config
      ? JSON.parse(patientData.call_config)
      : {};

    // Check total limit (must be < 4 for a retry to be scheduled)
    if (currentCallCount >= 4) {
      logger.warn("Total call limit reached. Marking callback as exhausted.", {
        callbackId,
        patientId,
      });
      await db.query(
        `UPDATE scheduled_callbacks SET status = 'exhausted', processed_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [callbackId]
      );
      return;
    }

    // Calculate the next retry time and attempt number
    const nextScheduledTime = this.calculateNextRetryTime(currentCallCount);
    const nextAttemptNumber = currentCallCount + 1;

    // Update scheduled_callbacks table with new time and status 'pending'
    await db.query(
      `UPDATE scheduled_callbacks
             SET status = 'pending',
                 scheduled_time = $2,
                 processed_at = CURRENT_TIMESTAMP,
                 callback_reason = $3
             WHERE id = $1`,
      [
        callbackId,
        nextScheduledTime,
        `Unanswered Call Retry: Attempt ${nextAttemptNumber}`,
      ]
    );

    // Update patient's call stats (incrementing count and logging time)
    const now = new Date().toISOString();
    patientCallAttempts[nextAttemptNumber] = now;

    await patientService.updateCallStats(
      patientId,
      nextAttemptNumber,
      JSON.stringify(patientCallAttempts)
    );

    logger.info("Callback successfully rescheduled after being unanswered.", {
      callbackId,
      nextScheduledTime,
      nextAttempt: nextAttemptNumber,
    });
  }

  /**
   * Marks the callback as completed after a successful call is detected by the webhook.
   */
  async markCallbackCompleted(callbackId) {
    logger.info("Marking callback as completed.", { callbackId });
    try {
      await db.query(
        `UPDATE scheduled_callbacks
                 SET status = 'completed',
                     processed_at = CURRENT_TIMESTAMP,
                     callback_reason = 'Call successful/answered.'
                 WHERE id = $1`,
        [callbackId]
      );
    } catch (error) {
      logger.error("Failed to mark callback as completed.", {
        callbackId,
        error: error.message,
      });
      throw error;
    }
  }
}

module.exports = CallbackService;
