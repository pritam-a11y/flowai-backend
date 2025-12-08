// const logger = require("../utils/logger");
// const moment = require("moment-timezone");
// const DataService = require("../services/dataService");
// const EmailService = require("../services/emailService");

// const TIMEZONE = process.env.TIMEZONE || "America/New_York";

// // Setting the default check interval to 1 minutes (60000 ms) to reduce load,
// // but the export logic only runs at 2:00 PM and 8:00 PM EST.
// const CRON_CHECK_INTERVAL_MS =
//   parseInt(process.env.CRON_CHECK_INTERVAL) || 60000;

// const dataService = new DataService();
// const emailService = new EmailService();

// class CronEmailScheduler {
//   constructor() {
//     this.intervalId = null;
//     this.isProcessing = false;
//     this.intervalMs = CRON_CHECK_INTERVAL_MS;
//     this.scheduledHours = [14, 20]; // 2 PM (14:00) and 8 PM (20:00) EST/EDT
//   }

//   start() {
//     if (this.intervalId) {
//       logger.warn("Email scheduler is already running");
//       return;
//     }

//     logger.info("Starting email scheduler", {
//       intervalMinutes: this.intervalMs / 60000,
//       scheduledHours: this.scheduledHours,
//     });

//     // Run the checker every N milliseconds (1 minutes by default)
//     this.intervalId = setInterval(() => {
//       this.checkAndRunCron();
//     }, this.intervalMs);
//   }

//   stop() {
//     if (this.intervalId) {
//       clearInterval(this.intervalId);
//       this.intervalId = null;
//       logger.info("Email scheduler stopped");
//     }
//   }

//   /**
//    * Checks if the current time is one of the scheduled hours (2 PM or 8 PM EST)
//    * and runs the data export if it is.
//    */
//   async checkAndRunCron() {
//     if (this.isProcessing) {
//       logger.info("Email cron processing already in progress, skipping");
//       return;
//     }

//     const now = moment().tz(TIMEZONE);
//     const currentHour = now.hour();
//     const currentMinute = now.minute();

//     // We only want to run exactly at the top of the scheduled hour (2:00 PM)
//     if (this.scheduledHours.includes(currentHour) && currentMinute === 0) {
//       this.isProcessing = true;

//       try {
//         logger.info(
//           `Cron trigger at ${currentHour}:00 ${TIMEZONE}. Initiating data export and email.`
//         );

//         let startTime;
//         const endTime = now.clone(); // 2 PM or 8 PM EST

//         if (currentHour === 14) {
//           // 2 PM Run: Covers updates from MIDNIGHT EST up to 2 PM EST.
//           startTime = endTime.clone().startOf("day");
//           logger.info(
//             "2 PM run: Fetching data from start of day (Midnight EST).",
//             { startTime: startTime.format() }
//           );
//         } else if (currentHour === 20) {
//           // 8 PM Run: Covers updates from 2 PM EST up to 8 PM EST.
//           startTime = endTime
//             .clone()
//             .hour(14)
//             .minute(0)
//             .second(0)
//             .millisecond(0);
//           logger.info("8 PM run: Fetching data from 2:00 PM EST.", {
//             startTime: startTime.format(),
//           });
//         } else {
//           // Should not happen
//           return;
//         }

//         // Convert times to UTC ISO strings for the database query
//         const startDateISO = startTime.toISOString();
//         const endDateISO = endTime.toISOString();

//         logger.info("Database query range (UTC ISO)", {
//           startDateISO: startDateISO,
//           endDateISO: endDateISO,
//         });

//         // Fetch data and generate CSV using the time window
//         const { csvData, rowCount } = await dataService.fetchAndGenerateCSV(
//           startDateISO,
//           endDateISO
//         );

//         if (rowCount === 0) {
//           logger.info(
//             "No updated patient data found in the current window. Skipping email.",
//             {
//               window: `${startTime.format("LT")} - ${endTime.format("LT")}`,
//             }
//           );
//           return;
//         }

//         // Send email with CSV attachment
//         await emailService.sendReportEmail(
//           csvData,
//           rowCount,
//           startTime,
//           endTime
//         );

//         logger.info("Data export and email successful.", { rowCount });
//       } catch (error) {
//         logger.error("Error running cron email job", {
//           error: error.message,
//           stack: error.stack,
//         });
//       } finally {
//         this.isProcessing = false;
//       }
//     }
//   }
// }

// module.exports = new CronEmailScheduler();
 
// const logger = require("../utils/logger");
// const moment = require("moment-timezone");
// const DataService = require("../services/dataService");
// const EmailService = require("../services/emailService");

// const TIMEZONE = process.env.TIMEZONE || "America/New_York";

// // Setting the default check interval to 1 minutes (60000 ms) to reduce load,
// // but the export logic only runs at 2:00 PM and 8:00 PM EST.
// const CRON_CHECK_INTERVAL_MS =
//   parseInt(process.env.CRON_CHECK_INTERVAL) || 60000;

// const dataService = new DataService();
// const emailService = new EmailService();

// class CronEmailScheduler {
//   constructor() {
//     this.intervalId = null;
//     this.isProcessing = false;
//     this.intervalMs = CRON_CHECK_INTERVAL_MS;
//     this.scheduledHours = [14, 20]; // 2 PM (14:00) and 8 PM (20:00) EST/EDT
//   }

//   start() {
//     if (this.intervalId) {
//       logger.warn("Email scheduler is already running");
//       return;
//     }

//     logger.info("Starting email scheduler", {
//       intervalMinutes: this.intervalMs / 60000,
//       scheduledHours: this.scheduledHours,
//     });

//     // Run the checker every N milliseconds (1 minutes by default)
//     this.intervalId = setInterval(() => {
//       this.checkAndRunCron();
//     }, this.intervalMs);
//   }

//   stop() {
//     if (this.intervalId) {
//       clearInterval(this.intervalId);
//       this.intervalId = null;
//       logger.info("Email scheduler stopped");
//     }
//   }

//   /**
//    * Checks if the current time is one of the scheduled hours (2 PM or 8 PM EST)
//    * and runs the data export if it is.
//    */
//   async checkAndRunCron() {
//     if (this.isProcessing) {
//       logger.info("Email cron processing already in progress, skipping");
//       return;
//     }

//     const now = moment().tz(TIMEZONE);
//     const currentHour = now.hour();
//     const currentMinute = now.minute();

//     // We only want to run exactly at the top of the scheduled hour (2:00 PM)
//     if (this.scheduledHours.includes(currentHour) && currentMinute === 0) {
//       this.isProcessing = true;

//       try {
//         logger.info(
//           `Cron trigger at ${currentHour}:00 ${TIMEZONE}. Initiating data export and email.`
//         );

//         let startTime;
//         const endTime = now.clone(); // 2 PM or 8 PM EST

//         if (currentHour === 14) {
//           // 2 PM Run: Covers updates from MIDNIGHT EST up to 2 PM EST.
//           startTime = endTime.clone().startOf("day");
//           logger.info(
//             "2 PM run: Fetching data from start of day (Midnight EST).",
//             { startTime: startTime.format() }
//           );
//         } else if (currentHour === 20) {
//           // 8 PM Run: Covers updates from 2 PM EST up to 8 PM EST.
//           startTime = endTime
//             .clone()
//             .hour(14)
//             .minute(0)
//             .second(0)
//             .millisecond(0);
//           logger.info("8 PM run: Fetching data from 2:00 PM EST.", {
//             startTime: startTime.format(),
//           });
//         } else {
//           // Should not happen
//           return;
//         }

//         // Convert times to UTC ISO strings for the database query
//         const startDateISO = startTime.toISOString();
//         const endDateISO = endTime.toISOString();

//         logger.info("Database query range (UTC ISO)", {
//           startDateISO: startDateISO,
//           endDateISO: endDateISO,
//         });

//         // Fetch data and generate CSV using the time window
//         const { csvData, rowCount } = await dataService.fetchAndGenerateCSV(
//           startDateISO,
//           endDateISO
//         );

//         if (rowCount === 0) {
//           logger.info(
//             "No updated patient data found in the current window. Skipping email.",
//             {
//               window: `${startTime.format("LT")} - ${endTime.format("LT")}`,
//             }
//           );
//           return;
//         }

//         // Send email with CSV attachment
//         await emailService.sendReportEmail(
//           csvData,
//           rowCount,
//           startTime,
//           endTime
//         );

//         logger.info("Data export and email successful.", { rowCount });
//       } catch (error) {
//         logger.error("Error running cron email job", {
//           error: error.message,
//           stack: error.stack,
//         });
//       } finally {
//         this.isProcessing = false;
//       }
//     }
//   }
// }

// module.exports = new CronEmailScheduler();

const logger = require("../utils/logger");
const moment = require("moment-timezone");
const DataService = require("../services/dataService");
const EmailService = require("../services/emailService");

const TIMEZONE = process.env.TIMEZONE || "America/New_York";

// Setting the check interval to 1 minutes (60000 ms).
const CRON_CHECK_INTERVAL_MS =
  parseInt(process.env.CRON_CHECK_INTERVAL) || 60000;

const dataService = new DataService();
const emailService = new EmailService();

class CronEmailScheduler {
  constructor() {
    this.intervalId = null;
    this.isProcessing = false;
    this.intervalMs = CRON_CHECK_INTERVAL_MS;
    // SCHEDULE CHANGE: Job will now run every time checkAndRunCron is called (every minute).
    this.scheduledHours = [];
  }

  start() {
    if (this.intervalId) {
      logger.warn("Email scheduler is already running");
      return;
    }

    logger.info("Starting email scheduler to run every minute", {
      intervalMinutes: this.intervalMs / 60000,
      TIMEZONE: TIMEZONE,
    });

    // Run the checker every N milliseconds (1 minute by default)
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
   * Runs the data export every time it is called (every minute).
   * It looks back 1 minute for updated data.
   */
  async checkAndRunCron() {
    if (this.isProcessing) {
      logger.info("Email cron processing already in progress, skipping");
      return;
    }

    this.isProcessing = true;
    const now = moment().tz(TIMEZONE);

    // Define the look-back window for 'every minute'
    const endTime = now.clone(); // The moment the job is triggered
    const startTime = now.clone().subtract(1, "minute"); // 1 minute before now

    try {
      logger.info(
        `Cron trigger every minute. Initiating data export and email for the window: ${startTime.format(
          "HH:mm:ss"
        )} to ${endTime.format("HH:mm:ss")}.`
      );

      // Convert times to UTC ISO strings for the database query
      const startDateISO = startTime.toISOString();
      const endDateISO = endTime.toISOString();

      logger.info("Database query range (UTC ISO)", {
        startDateISO: startDateISO,
        endDateISO: endDateISO,
      });

      // Fetch data and generate CSV using the time window
      const { csvData, rowCount, } =
        await dataService.fetchAndGenerateCSV(startDateISO, endDateISO);

      if (rowCount === 0) {
        logger.info(
          "No updated patient data found in the current minute. Skipping email.",
          {
            window: `${startTime.format("HH:mm:ss")} - ${endTime.format(
              "HH:mm:ss"
            )}`,
          }
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

module.exports = new CronEmailScheduler();
