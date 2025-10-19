const express = require("express");
const router = express.Router();
const logger = require("../utils/logger");

/**
 * @swagger
 * /api/timezones/current-time/{timezone}:
 *   get:
 *     summary: Get current time for a specific US timezone
 *     description: Returns the current time for the specified US timezone
 *     tags: [Timezones]
 *     parameters:
 *       - in: path
 *         name: timezone
 *         required: true
 *         description: Timezone abbreviation (ET, CT, MT, PT, AKT, UTC, AWST)
 *         schema:
 *           type: string
 *           enum: [ET, CT, MT, PT, AKT, UTC, AWST]
 *     responses:
 *       200:
 *         description: Successfully retrieved current time for timezone
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 timezone:
 *                   type: string
 *                   description: Requested timezone
 *                   example: "ET"
 *                 currentTime:
 *                   type: string
 *                   description: Current time in ISO format
 *                   example: "2024-01-15T14:30:00-05:00"
 *                 formatted:
 *                   type: string
 *                   description: Human-readable formatted time
 *                   example: "2:30 PM EST"
 *                 utcTime:
 *                   type: string
 *                   description: Current UTC time
 *                   example: "2024-01-15T19:30:00Z"
 *       400:
 *         description: Invalid timezone provided
 *       500:
 *         description: Server error
 */
router.get("/current-time/:timezone", async (req, res) => {
  try {
    const requestedTimezone = req.params.timezone.toUpperCase();
    
    logger.info("Fetching current time for timezone", { timezone: requestedTimezone });

    // Timezone mappings
    const timezoneMap = {
      "ET": {
        id: "America/New_York",
        name: "Eastern Time",
        offsetStandard: -5,
        offsetDST: -4
      },
      "CT": {
        id: "America/Chicago",
        name: "Central Time",
        offsetStandard: -6,
        offsetDST: -5
      },
      "MT": {
        id: "America/Denver",
        name: "Mountain Time",
        offsetStandard: -7,
        offsetDST: -6
      },
      "PT": {
        id: "America/Los_Angeles",
        name: "Pacific Time",
        offsetStandard: -8,
        offsetDST: -7
      },
      "AKT": {
        id: "America/Anchorage",
        name: "Alaska Time",
        offsetStandard: -9,
        offsetDST: -8
      },
      "UTC": {
        id: "UTC",
        name: "Coordinated Universal Time",
        offsetStandard: 0,
        offsetDST: 0
      },
      "AWST": {
        id: "Australia/Perth",
        name: "Australian Western Standard Time",
        offsetStandard: 8,
        offsetDST: 8  // Perth doesn't observe DST
      }
    };

    // Check if timezone is valid
    if (!timezoneMap[requestedTimezone]) {
      return res.status(400).json({
        success: false,
        error: `Invalid timezone. Please use one of: ${Object.keys(timezoneMap).join(", ")}`
      });
    }

    const tzInfo = timezoneMap[requestedTimezone];
    
    // Get current UTC time
    const now = new Date();

    // Determine if DST is active
    let isDST = false;
    let currentOffset = tzInfo.offsetStandard;

    // Handle DST logic based on timezone
    if (requestedTimezone === "UTC" || requestedTimezone === "AWST") {
      // UTC and AWST don't observe DST
      isDST = false;
      currentOffset = tzInfo.offsetStandard;
    } else {
      // US timezones - rough approximation for DST (March-November)
      const month = now.getMonth() + 1;
      isDST = month >= 3 && month <= 11;
      currentOffset = isDST ? tzInfo.offsetDST : tzInfo.offsetStandard;
    }
    
    // Calculate time in the requested timezone
    const utcTime = now.getTime();
    const timezoneTime = new Date(utcTime + (currentOffset * 60 * 60 * 1000));
    
    // Format the time
    const hours = timezoneTime.getUTCHours();
    const minutes = timezoneTime.getUTCMinutes();
    const seconds = timezoneTime.getUTCSeconds();
    
    // Create formatted strings
    const period = hours >= 12 ? "PM" : "AM";
    const displayHours = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);

    // Format timezone suffix
    let timezoneSuffix = requestedTimezone;
    if (requestedTimezone !== "UTC" && requestedTimezone !== "AWST") {
      timezoneSuffix = `${requestedTimezone}${isDST ? "DT" : "ST"}`;
    }

    const formattedTime = `${displayHours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")} ${period} ${timezoneSuffix}`;
    
    // Create ISO string with proper offset
    const year = timezoneTime.getUTCFullYear();
    const monthStr = (timezoneTime.getUTCMonth() + 1).toString().padStart(2, "0");
    const day = timezoneTime.getUTCDate().toString().padStart(2, "0");
    const hoursStr = hours.toString().padStart(2, "0");
    const minutesStr = minutes.toString().padStart(2, "0");
    const secondsStr = seconds.toString().padStart(2, "0");
    
    const offsetHours = Math.abs(currentOffset);
    const offsetSign = currentOffset < 0 ? "-" : "+";
    const offsetString = `${offsetSign}${offsetHours.toString().padStart(2, "0")}:00`;
    
    const isoString = `${year}-${monthStr}-${day}T${hoursStr}:${minutesStr}:${secondsStr}${offsetString}`;

    logger.info(`Successfully retrieved current time for ${requestedTimezone}`);

    res.json({
      success: true,
      timezone: requestedTimezone,
      timezoneName: tzInfo.name,
      currentTime: isoString
    });

  } catch (error) {
    logger.error("Error fetching current time for timezone", {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      error: "Failed to fetch current time for timezone"
    });
  }
});

module.exports = router;