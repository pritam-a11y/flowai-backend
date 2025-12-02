const db = require("../db/connection");
const logger = require("../utils/logger");
const retellService = require("./retellService");
const moment = require("moment-timezone");
const AuthService = require("./authService");
const PatientService = require("../services/PatientService");
 
const BUSINESS_HOUR_START = parseInt(process.env.BUSINESS_HOUR_START) || 8;  
const BUSINESS_HOUR_END = parseInt(process.env.BUSINESS_HOUR_END) || 20;  
const TIMEZONE = process.env.TIMEZONE || "America/New_York";

const CRON_CALLBACK_INTERVAL_MS =
  parseInt(process.env.CRON_CALLBACK_INTERVAL) || 60000; // Default to 1 minute

const patientService = new PatientService();
const authService = new AuthService();

class CallbackScheduler {
  constructor() {
    this.intervalId = null;
    this.isProcessing = false;
    this.intervalMs = CRON_CALLBACK_INTERVAL_MS;
  }

  /**
   * Start the callback scheduler
   */
  start() {
    if (this.intervalId) {
      logger.warn("Callback scheduler is already running");
      return;
    }

    logger.info("Starting callback scheduler", {
      intervalMinutes: this.intervalMs / 60000,
    });

    // Run immediately on start
    this.processCallbacks();

    // Then run every N milliseconds
    this.intervalId = setInterval(() => {
      this.processCallbacks();
    }, this.intervalMs);
  }

  /**
   * Stop the callback scheduler
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info("Callback scheduler stopped");
    }
  }

  /**
   * Process pending callbacks within the next 1-minute window
   */
  async processCallbacks() {
    if (this.isProcessing) {
      logger.info("Callback processing already in progress, skipping");
      return;
    }

    this.isProcessing = true;

    try {
      const now = new Date();

      logger.info("Processing scheduled callbacks", {
        windowStart: now.toISOString(),
      });

      // Query for pending callbacks within the time window
      const query = `
            SELECT callback_id, patient_id, agent_callback_number, scheduled_time, callback_reason
            FROM scheduled_callbacks
            WHERE status = 'pending'
            AND scheduled_time <= $1 
            ORDER BY scheduled_time ASC
            `;

      const result = await db.query(query, [now.toISOString()]);

      if (result.rows.length === 0) {
        logger.info("No callbacks to process in this window");
        return;
      }

      logger.info(`Found ${result.rows.length} callbacks to process`);

      // Process each callback
      for (const callback of result.rows) {
        await this.processSingleCallback(callback);
      }
    } catch (error) {
      logger.error("Error processing callbacks", {
        error: error.message,
        stack: error.stack,
      });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single callback
   * @param {Object} callback - The callback record from database
   */
  async processSingleCallback(callback) {
    const { callback_id, patient_id, agent_callback_number, scheduled_time } =
      callback;

    logger.info("Processing callback", {
      callbackId: callback_id,
      patientId: patient_id,
      scheduledTime: scheduled_time,
    });

    let patientData;
    try {
      // --- RETRIEVE CALL STATS ---
      patientData = await patientService.getPatientData(patient_id);
      const currentCallCount = patientData.call_count || 0;
      const callAttempts = patientData.call_config
        ? JSON.parse(patientData.call_config)
        : {};
      const nextAttempt = currentCallCount + 1;

      if (!patientData || !patientData.phone) {
        logger.error(
          "Patient data or phone number not found. Marking callback as failed.",
          { patientId: patient_id }
        );
        await db.query(
          `UPDATE scheduled_callbacks 
                     SET status = 'failed', processed_at = CURRENT_TIMESTAMP, error_message = $2
                     WHERE callback_id = $1`,
          [callback_id, "Patient data or phone number missing for call."]
        );
        return;
      }

      // --- Total Attempt Limit Check (Max 4 calls) ---
      if (currentCallCount >= 4) {
        logger.warn(
          "Maximum total callback attempts (4) reached. Marking callback as exhausted.",
          { patientId: patient_id }
        );
        await db.query(
          `UPDATE scheduled_callbacks SET status = 'exhausted', processed_at = CURRENT_TIMESTAMP WHERE callback_id = $1`,
          [callback_id]
        );
        return;
      }

      // --- Business Hours Check (Mandatory for retries, SKIPPED for initial call) ---
      if (currentCallCount > 0) {
        const nowMoment = moment().tz(TIMEZONE);
        const currentHour = nowMoment.hour();
        const isWithinBusinessHours =
          currentHour >= BUSINESS_HOUR_START && currentHour < BUSINESS_HOUR_END;

        if (!isWithinBusinessHours) {
          // Reschedule for 8 AM the next day 
          let nextBusinessTime = nowMoment.clone();

          // If current hour is past BUSINESS_HOUR_END, move to the next day
          if (currentHour >= BUSINESS_HOUR_END) {
            nextBusinessTime.add(1, "day");
          }

          nextBusinessTime.set({
            hour: BUSINESS_HOUR_START,
            minute: 0,
            second: 0,
            millisecond: 0,
          });

          // Skip weekends (0=Sunday, 6=Saturday)
          while (nextBusinessTime.day() === 0 || nextBusinessTime.day() === 6) {
            nextBusinessTime.add(1, "day");
          }

          const nextScheduledTimeISO = nextBusinessTime.toISOString();

          logger.warn(
            "Callback is a retry (attempt > 1) and is outside business hours. Rescheduling for next business hour.",
            {
              callbackId: callback_id,
              currentHour,
              nextTime: nextScheduledTimeISO,
            }
          );

          await db.query(
            `UPDATE scheduled_callbacks 
                         SET scheduled_time = $2, 
                             processed_at = CURRENT_TIMESTAMP,
                             callback_reason = 'Outside business hours, rescheduled.'
                         WHERE callback_id = $1`,
            [callback_id, nextScheduledTimeISO]
          );
          return; // Skip call attempt
        }
      }

      // --- Daily Limit Check (Max 2 calls per day) ---
      const today = moment().startOf("day");
      const callsToday = Object.values(callAttempts).filter((timestamp) =>
        moment(timestamp).isSame(today, "day")
      ).length;

      if (callsToday >= 2) {
        // Reschedule for 8 AM the next day.
        const nextDayScheduledTime = moment(new Date())
          .add(1, "day")
          .hour(BUSINESS_HOUR_START)
          .minute(0)
          .second(0)
          .millisecond(0) 
          .toISOString();

        logger.warn(
          "Daily call limit (2) reached for patient. Rescheduling for next day 8 AM.",
          { patientId: patient_id, nextTime: nextDayScheduledTime }
        );

        // Update scheduled_callbacks with the new time
        await db.query(
          `UPDATE scheduled_callbacks 
                     SET scheduled_time = $2, 
                         processed_at = CURRENT_TIMESTAMP,
                         callback_reason = 'Daily limit reached, rescheduled for next day 8AM.'
                     WHERE callback_id = $1`,
          [callback_id, nextDayScheduledTime]
        );
        return; // Skip this call attempt
      }

      // --- Initiate Call ---
      const accessToken = await authService.getAccessToken();

      const dynamicVariables = {
        // Call context
        call_type: "callback",
        access_token: accessToken,

        // Patient details
        patient_id: patient_id,
        patient_name: patientData.fullName || "",
        patient_phone: patientData.phone || "",
        patient_email: patientData.email || "",
        patient_dob: patientData.dateOfBirth || "",
        patient_zip: patientData.zipCode || "",
        patient_address: patientData.address || "",
        patient_insurance_name: patientData.insuranceName || "",
        insurance_type: patientData.insuranceType || "",
        patient_insurance_member_id: patientData.insuranceMemberId || "",

        // Appointment details if available
        patient_appointment_type: patientData?.appointmentType || "",
        appointment_date: patientData.appointmentDate || "",
        appointment_time: patientData.appointmentTime || "",
        patient_call_status: patientData?.status || "",
      };

      // Create callback call
      const callResponse = await retellService.createCallbackCall(
        agent_callback_number,
        patientData.phone,
        dynamicVariables
      );

      // --- Call Initiation Success: Update Status and Patient Call Stats ---
      // Update scheduled_callbacks status to 'call_in_progress'
      await db.query(
        `UPDATE scheduled_callbacks 
                 SET status = 'call_in_progress', 
                     processed_at = CURRENT_TIMESTAMP 
                 WHERE callback_id = $1`,
        [callback_id]
      );

      //  Update patient's call count and config (record that a call was initiated NOW)
      const newAttemptTime = new Date().toISOString();
      callAttempts[nextAttempt] = newAttemptTime; // Record this attempt's timestamp

      // patientService.updateCallStats is responsible for setting the new call_count and updating the call_config column.
      await patientService.updateCallStats(
        patient_id,
        nextAttempt, // This is the NEW total call count
        JSON.stringify(callAttempts) // This is the updated JSON for call_config
      );

      logger.info(
        "Callback call initiated successfully. Patient call stats updated.",
        {
          callbackId: callback_id,
          retellCallId: callResponse.call_id,
          newCallCount: nextAttempt,
        }
      );
    } catch (error) {
      logger.error("Error processing callback call initiation", {
        callbackId: callback_id,
        patientId: patient_id,
        error: error.message,
      });

      // Update callback status to failed due to system/API error
      await db.query(
        `UPDATE scheduled_callbacks 
                 SET status = 'failed', 
                     processed_at = CURRENT_TIMESTAMP,
                     error_message = $2
                 WHERE callback_id = $1`,
        [callback_id, `Call Initiation Error: ${error.message}`]
      );
    }
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      running: !!this.intervalId,
      processing: this.isProcessing,
      intervalMinutes: this.intervalMs / 60000,
    };
  }

  /**
   * Get statistics about scheduled callbacks
   */
  async getStats() {
    try {
      const statsQuery = `
              SELECT 
                status,
                COUNT(*) as count
              FROM scheduled_callbacks
              GROUP BY status
            `;

      const upcomingQuery = `
              SELECT COUNT(*) as count
              FROM scheduled_callbacks
              WHERE status = 'pending'
                AND scheduled_time > CURRENT_TIMESTAMP
                AND scheduled_time <= CURRENT_TIMESTAMP + INTERVAL '1 minute'
            `;

      const [statsResult, upcomingResult] = await Promise.all([
        db.query(statsQuery),
        db.query(upcomingQuery),
      ]);

      const stats = {
        pending: 0,
        completed: 0,
        failed: 0,
        exhausted: 0,
        call_in_progress: 0,
      };

      statsResult.rows.forEach((row) => {
        stats[row.status] = parseInt(row.count);
      });

      stats.upcomingInNext1Minute = parseInt(upcomingResult.rows[0].count);

      return stats;
    } catch (error) {
      logger.error("Error getting callback stats", {
        error: error.message,
      });
      throw error;
    }
  }
}

module.exports = new CallbackScheduler();