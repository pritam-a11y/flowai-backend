const db = require("../db/connection");
const logger = require("../utils/logger");
const retellService = require("./retellService"); 
const AuthService = require("./authService");
const PatientService = require("../services/PatientService");  

const CRON_CALLBACK_INTERVAL_MS = parseInt(process.env.CRON_CALLBACK_INTERVAL); // Default to 1 minute

const patientService = new PatientService();

const authService = new AuthService();

class CallbackScheduler {
  constructor() {
    this.intervalId = null;
    this.isProcessing = false;
    this.intervalMs = CRON_CALLBACK_INTERVAL_MS // 1 minute
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

    // Then run every 1 minute
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
    // Prevent concurrent processing
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

      const result = await db.query(query, [now, windowEnd]);

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
    const { callback_id, patient_id, agent_callback_number, scheduled_time } = callback;

    logger.info("Processing callback", {
      callbackId: callback_id,
      patientId: patient_id,
      agentCallbackNumber: agent_callback_number,
      scheduledTime: scheduled_time,
    });

    try {
         // Get access token
       const accessToken = await authService.getAccessToken();
  
       const patientData = await patientService.getPatientData(patient_id);

      if (!patientData || !patientData.phone) { 
        logger.error("Patient data or phone number not found.", { 
          patientId: patient_id,
        });
   }
     
      // Prepare dynamic variables for the callback
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
        patient_appointment_status: patientData?.status || "", 
      };

      // Create callback call from agent_callback_number to patient's registered phone
      const callResponse = await retellService.createCallbackCall(
        agent_callback_number,
        patientData.phone,
        dynamicVariables
      );

      // Update callback status to completed
      await db.query(
        `UPDATE scheduled_callbacks 
         SET status = 'completed', 
             processed_at = CURRENT_TIMESTAMP 
         WHERE callback_id = $1`,
        [callback_id]
      );

      logger.info("Callback processed successfully", {
        callbackId: callback_id,
        patientId: patient_id,
        retellCallId: callResponse.call_id,
        retellCallStatus: callResponse.status,
      });
    } catch (error) {
      logger.error("Error processing callback", {
        callbackId: callback_id,
        patientId: patient_id,
        error: error.message,
      });

      // Update callback status to failed
      await db.query(
        `UPDATE scheduled_callbacks 
         SET status = 'failed', 
             processed_at = CURRENT_TIMESTAMP,
             error_message = $2
         WHERE callback_id = $1`,
        [callback_id, error.message]
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

// Export singleton instance
module.exports = new CallbackScheduler();