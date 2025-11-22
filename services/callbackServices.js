const db = require("../db/connection");
const logger = require("../utils/logger");
const moment = require('moment-timezone'); 
 
const BUSINESS_HOUR_START = parseInt(process.env.BUSINESS_HOUR_START) || 9;
const BUSINESS_HOUR_END = parseInt(process.env.BUSINESS_HOUR_END) || 17;
const FLOW_CALLBACK_BUFFER_HOURS = parseInt(process.env.FLOW_CALLBACK_BUFFER_HOURS) || 6;
const TIMEZONE = process.env.TIMEZONE || 'America/New_York';

class CallbackService {
    
    calculateScheduledTime(failedAt) {
        const now = moment.tz(failedAt, TIMEZONE);
        const bufferTime = now.clone().add(FLOW_CALLBACK_BUFFER_HOURS, 'hours');
        
        const bufferHour = bufferTime.hour();

        if (bufferHour >= BUSINESS_HOUR_START && bufferHour < BUSINESS_HOUR_END) {
            return bufferTime.toISOString();
        }

        let nextBusinessTime = bufferTime.clone();

        if (bufferHour >= BUSINESS_HOUR_END) {
            nextBusinessTime.add(1, 'days');
        } 
        
        nextBusinessTime.set({ 
            hour: BUSINESS_HOUR_START, 
            minute: 0, 
            second: 0, 
            millisecond: 0 
        });

        while (nextBusinessTime.day() === 0 || nextBusinessTime.day() === 6) { 
            nextBusinessTime.add(1, 'days');
        }
        
        return nextBusinessTime.toISOString();
    }
    
    /**
     * Inserts a new callback entry into the scheduled_callbacks table.
     */
    async scheduleCallback(patientId, agentCallbackNumber, scheduledTime, reason, status = 'pending') {
        logger.info("Scheduling new callback entry", { patientId, scheduledTime, reason });
      
        //  INSERT into scheduled_callbacks
    const insertQuery = `
    INSERT INTO scheduled_callbacks 
        (patient_id, agent_callback_number, schedule_time, callback_reason, status) 
    VALUES ($1, $2, $3, $4, $5) 
    RETURNING callback_id;
`;

// UPDATE call_count in patients table
const updateCountQuery = `
    UPDATE patients 
    SET call_count = COALESCE(call_count, 0) + 1 
    WHERE patient_id = $1;
`;
        try {
          // Execute the insertion first
        const result = await db.query(insertQuery, [patientId, agentCallbackNumber, scheduledTime, reason, status]);
        const callbackId = result.rows[0].callback_id;

        // Execute the call count update 
        await db.query(updateCountQuery, [patientId]);
        
        logger.info("Callback scheduled and call count incremented successfully.", { callbackId });
        return callbackId;
        } catch (error) {
            logger.error("Failed to insert callback into database", { error: error.message });
        }
    }
}

module.exports = CallbackService;