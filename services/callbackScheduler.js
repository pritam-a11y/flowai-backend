const db = require("../db/connection");
const logger = require("../utils/logger");
const retellService = require("./retellService");
const RedoxAPIService = require("./redoxApiService");
const RedoxTransformer = require("../utils/redoxTransformer");
const AuthService = require("./authService");

const authService = new AuthService();

class CallbackScheduler {
  constructor() {
    this.intervalId = null;
    this.isProcessing = false;
    this.intervalMs = 1 * 60 * 1000; // 1 minute
  }

  /**
   * Map agent phone number to agent configuration
   * @param {string} agentPhoneNumber - The agent's phone number
   * @returns {Object|null} - Agent config with type, or null if not found
   */
  getAgentConfigByPhoneNumber(agentPhoneNumber) {
    // Map of agent phone numbers to agent types
    // This mapping is based on environment variables in retellService.js
    const agentMapping = {
      [process.env.RETELL_SCHEDULING_FROM_NUMBER || process.env.RETELL_FROM_NUMBER]: { type: "scheduling" },
      [process.env.RETELL_INTAKE_FROM_NUMBER]: { type: "intake" },
    };

    return agentMapping[agentPhoneNumber] || null;
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
      const windowEnd = new Date(now.getTime() + this.intervalMs);

      logger.info("Processing scheduled callbacks", {
        windowStart: now.toISOString(),
        windowEnd: windowEnd.toISOString(),
      });

      // Query for pending callbacks within the time window
      const query = `
        SELECT id, patient_id, callback_phone_number, agent_phone_number, scheduled_time
        FROM scheduled_callbacks
        WHERE status = 'pending'
          AND scheduled_time >= $1
          AND scheduled_time < $2
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
    const { id, patient_id, callback_phone_number, agent_phone_number, scheduled_time } = callback;

    logger.info("Processing callback", {
      callbackId: id,
      patientId: patient_id,
      callbackPhoneNumber: callback_phone_number,
      agentPhoneNumber: agent_phone_number,
      scheduledTime: scheduled_time,
    });

    try {
      // Get access token
      const accessToken = await authService.getAccessToken();

      // Fetch patient details from Redox
      const patientResponse = await RedoxAPIService.makeRequest(
        "GET",
        `/Patient/${patient_id}`,
        null,
        null,
        accessToken
      );

      if (!patientResponse || !patientResponse.id) {
        throw new Error(`Patient not found: ${patient_id}`);
      }

      // Transform patient data
      const patientData = RedoxTransformer.transformPatientSearchResponse({
        entry: [{ resource: patientResponse }],
      })[0];

      // Search for appointments
      let appointments = [];
      try {
        const appointmentSearchParams =
          RedoxTransformer.createAppointmentSearchParams(patient_id);
        const appointmentResponse = await RedoxAPIService.makeRequest(
          "POST",
          "/Appointment/_search",
          null,
          appointmentSearchParams,
          accessToken
        );
        appointments =
          RedoxTransformer.transformAppointmentSearchResponse(appointmentResponse);
      } catch (appointmentError) {
        logger.warn("Failed to fetch appointments for callback", {
          error: appointmentError.message,
          patientId: patient_id,
        });
      }

      // Get the most recent appointment
      const appointment = appointments.length > 0 ? appointments[0] : null;

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
        patient_appointment_id: appointment?.appointmentId || "",
        patient_appointment_type: appointment?.appointmentType || "",
        appointment_start: appointment?.startTime || "",
        patient_appointment_status: appointment?.status || "",
        appointment_description: appointment?.description || "",
      };

      // Determine which Retell service method to use based on agent phone number
      // Map agent phone number to agent type
      const agentConfig = this.getAgentConfigByPhoneNumber(agent_phone_number);

      if (!agentConfig) {
        throw new Error(`Unknown agent phone number: ${agent_phone_number}`);
      }

      logger.info("Using agent configuration for callback", {
        agentPhoneNumber: agent_phone_number,
        agentType: agentConfig.type,
        callbackId: id,
      });

      // Create the callback call using the callback phone number (not patient's Redox phone)
      let callResponse;
      if (agentConfig.type === "scheduling") {
        callResponse = await retellService.createSchedulingCall(
          callback_phone_number,
          dynamicVariables
        );
      } else if (agentConfig.type === "intake") {
        callResponse = await retellService.createIntakeCall(
          callback_phone_number,
          dynamicVariables
        );
      } else {
        throw new Error(`Unknown agent type: ${agentConfig.type}`);
      }

      // Update callback status to completed
      await db.query(
        `UPDATE scheduled_callbacks 
         SET status = 'completed', 
             processed_at = CURRENT_TIMESTAMP 
         WHERE id = $1`,
        [id]
      );

      logger.info("Callback processed successfully", {
        callbackId: id,
        patientId: patient_id,
        retellCallId: callResponse.call_id,
        retellCallStatus: callResponse.status,
      });
    } catch (error) {
      logger.error("Error processing callback", {
        callbackId: id,
        patientId: patient_id,
        error: error.message,
      });

      // Update callback status to failed
      await db.query(
        `UPDATE scheduled_callbacks 
         SET status = 'failed', 
             processed_at = CURRENT_TIMESTAMP,
             error_message = $2
         WHERE id = $1`,
        [id, error.message]
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