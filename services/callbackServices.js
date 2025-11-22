const db = require("../db/connection");
const logger = require("../utils/logger");
const moment = require('moment-timezone');
const { v4: uuidv4 } = require('uuid');  
 
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
       
        // Generate the unique ID for the callback
         const callbackId = uuidv4(); 
         const createdAt = new Date().toISOString();  
        
        logger.info("Scheduling new callback entry", {callbackId, patientId, scheduledTime, reason, createdAt });
      

        //  INSERT into scheduled_callbacks
        const insertQuery = `
        INSERT INTO scheduled_callbacks 
                (callback_id, patient_id, agent_callback_number, schedule_time, callback_reason, status, created_at) 
            VALUES ($1, $2, $3, $4, $5, $6, $7);
    `;

      // UPDATE call_count in patients table
  const updateCountQuery = `
            UPDATE patients 
            SET call_count = COALESCE(call_count, 0) + 1 
            WHERE patient_id = $1;
        `;
        try {
          // Execute the insertion first
        await db.query(insertQuery, [callbackId, patientId, agentCallbackNumber, scheduledTime, reason, status, createdAt]);

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