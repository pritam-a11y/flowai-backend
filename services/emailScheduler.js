const logger = require("../utils/logger");
const moment = require("moment-timezone");
const DataService = require("../services/dataService");
const EmailService = require("../services/emailService");
 
const TIMEZONE = process.env.TIMEZONE || "America/New_York";
 
const CRON_CHECK_INTERVAL_MS = parseInt(process.env.CRON_CHECK_INTERVAL) || 60000; // 1 minute

const dataService = new DataService();
const emailService = new EmailService();

class CronEmailScheduler {
    constructor() {
        this.intervalId = null;
        this.isProcessing = false;
        this.intervalMs = CRON_CHECK_INTERVAL_MS;
        // Times for email run in 24-hour format (EST/EDT)
        this.scheduledHours = [14, 20]; // 2 PM and 8 PM EST/EDT
    }

    start() {
        if (this.intervalId) {
            logger.warn("Email scheduler is already running");
            return;
        }

        logger.info("Starting email scheduler", {
            intervalMinutes: this.intervalMs / 60000,
            scheduledHours: this.scheduledHours,
        });

        // Run the checker every N milliseconds
        this.intervalId = setInterval(() => {
            this.checkAndRunCron();
        }, this.intervalMs);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            logger.info("Email scheduler stopped");
        }
    }

    /**
     * Checks if the current time is one of the scheduled hours (2 PM or 8 PM EST)
     * and runs the data export if it is.
     */
    async checkAndRunCron() {
        if (this.isProcessing) {
            logger.info("Email cron processing already in progress, skipping");
            return;
        }

        const now = moment().tz(TIMEZONE);
        const currentHour = now.hour();
        const currentMinute = now.minute();
        
        // We only want to run exactly at the top of the scheduled hour (e.g., 2:00 PM)
        if (this.scheduledHours.includes(currentHour) && currentMinute === 0) {
            this.isProcessing = true;

            try {
                logger.info(`Cron trigger at ${currentHour}:00 ${TIMEZONE}. Initiating data export and email.`);

                // 1. Determine the time range for data fetching
                const endTime = now.clone(); // 2 PM or 8 PM
                const startTime = endTime.clone().subtract(6, 'hours'); // 8 AM or 2 PM
                
                // For 2 PM job, range is 8 AM EST to 2 PM EST
                // For 8 PM job, range is 2 PM EST to 8 PM EST

                const startDate = startTime.toISOString();
                const endDate = endTime.toISOString();

                logger.info("Fetching patient data within range", {
                    startTime: startTime.format(), 
                    endTime: endTime.format()
                });

                // 2. Fetch data and generate CSV
                const { csvData, rowCount } = await dataService.fetchAndGenerateCSV(startDate, endDate);

                if (rowCount === 0) {
                    logger.info("No updated patient data found in the current window. Skipping email.");
                    return;
                }

                // 3. Send email with CSV attachment
                await emailService.sendReportEmail(csvData, rowCount, startTime, endTime);

                logger.info("Data export and email successful.", { rowCount });
                
            } catch (error) {
                logger.error("Error running cron email job", {
                    error: error.message,
                    stack: error.stack,
                });
            } finally {
                this.isProcessing = false;
            }
        }
    }
}

 module.exports = new CronEmailScheduler();