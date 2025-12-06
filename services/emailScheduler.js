// schedulers/EmailScheduler.js
const logger = require("../utils/logger");
const moment = require("moment-timezone");
const DataService = require("../services/dataService");
const EmailService = require("../services/emailService");  

const TIMEZONE = process.env.TIMEZONE || "America/New_York";

// 1. UPDATED: Set the default check interval back to 1 minute (60,000 ms)
const CRON_CHECK_INTERVAL_MS =
  parseInt(process.env.CRON_CHECK_INTERVAL) || 60000;

const dataService = new DataService();
const emailService = new EmailService();

class CronEmailScheduler {
  constructor() {
    this.intervalId = null;
    this.isProcessing = false;
    this.intervalMs = CRON_CHECK_INTERVAL_MS;
    // Keeping this defined, but it is ignored in checkAndRunCron() below.
    this.scheduledHours = [14, 20]; 
  }

  start() {
    if (this.intervalId) {
      logger.warn("Email scheduler is already running");
      return;
    }

    logger.info("Starting email scheduler (TEMPORARY: Running every minute)", {
      intervalMinutes: this.intervalMs / 60000,
    });

    // Run the checker every 60000 milliseconds (1 minute)
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
   * RUNS EVERY MINUTE: Fetches data updated in the last minute.
   */
  async checkAndRunCron() {
    if (this.isProcessing) {
      logger.info("Email cron processing already in progress, skipping");
      return;
    }

    // NOTE: The conditional check based on scheduledHours and currentMinute has been REMOVED.
    this.isProcessing = true;

    try {
        const endTime = moment().tz(TIMEZONE);
        // Define the time window as the last 1 minute
        const startTime = endTime.clone().subtract(1, "minute"); 
        
        logger.info(`Cron trigger (Every Minute TEMP Run). Fetching data from the last minute.`);

        // Convert times to UTC ISO strings for the database query
        const startDateISO = startTime.toISOString();
        const endDateISO = endTime.toISOString();

        logger.info("Database query range (UTC ISO)", {
            startDateISO: startDateISO,
            endDateISO: endDateISO,
        });

        // Fetch data and generate CSV using the 1-minute time window
        const { csvData, rowCount } = await dataService.fetchAndGenerateCSV(
            startDateISO,
            endDateISO
        );

        if (rowCount === 0) {
            logger.info(
                "No updated patient data found in the current minute. Skipping email."
            );
            return;
        }

        // Send email with CSV attachment
        await emailService.sendReportEmail(
            csvData,
            rowCount,
            startTime,
            endTime
        );

        logger.info("Data export and email successful (TEMP Run).", { rowCount });
    } catch (error) {
        logger.error("Error running cron email job (TEMP Run)", {
            error: error.message,
            stack: error.stack,
        });
    } finally {
        this.isProcessing = false;
    }
  }
}

module.exports = new CronEmailScheduler();