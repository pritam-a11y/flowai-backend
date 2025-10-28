const express = require("express");
const router = express.Router();
const db = require("../db/connection");
const logger = require("../utils/logger");
const jwtMiddleware = require("../middleware/jwt");
const moment = require("moment");

const calculatePercentage = (numerator, denominator) => {
  if (denominator === 0) return 0.0;
  return Number(((numerator / denominator) * 100).toFixed(1));
};

/**
 * @swagger
 * tags:
 *   - name: CallAnalytics
 *     description: Call Analytics and Reporting endpoints
 */

/**
 * @swagger
 * /api/v1/callAnalytics:
 *   get:
 *     summary: Retrieve comprehensive dashboard metrics and time series data
 *     tags: [CallAnalytics]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Aggregates and returns high-level summary metrics, daily time series data,
 *       and detailed agent performance statistics in a single response. All data is filtered by `org_id`
 *       and the optional date range (`from`/`to`).
 *     parameters:
 *       - in: query
 *         name: org_id
 *         schema:
 *           type: string
 *         required: true
 *         description: Organization ID to filter analytics data.
 *         example: org_123
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *         required: false
 *         description: Start date (YYYY-MM-DD) for the filter range. Defaults to one year ago if omitted.
 *         example: 2025-08-01
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *         required: false
 *         description: End date (YYYY-MM-DD) for the filter range. Defaults to today's date if omitted.
 *         example: 2025-10-31
 *       - in: query
 *         name: agent_name
 *         schema:
 *           type: string
 *         required: false
 *         description: Optional filter to search for a specific agent name (case-insensitive partial match).
 *         example: Urology
 *     responses:
 *       200:
 *         description: Successfully retrieved all dashboard analytics data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:
 *                 status: true
 *                 data:
 *                   summary:
 *                     totalCalls: 155
 *                     averageCallDuration: 95.5
 *                     averageLatency: 255
 *                     dateRange:
 *                       start: "2025-08-01"
 *                       end: "2025-10-23"
 *       400:
 *         description: Missing or invalid org_id parameter.
 *         content:
 *           application/json:
 *             schema:
 *               example:
 *                 success: false
 *                 message: "org_id query parameter is required."
 *       500:
 *         description: Failed to retrieve data due to a server or database error.
 *         content:
 *           application/json:
 *             schema:
 *               example:
 *                 error: "Failed to retrieve call dashboard data from database."
 *                 details: "Database query error."
 */
router.get("/", jwtMiddleware, async (req, res) => {
  const { org_id, from, to, agent_name } = req.query;

  // Manditory org_id ---
  if (!org_id) {
    return res
      .status(400)
      .json({ success: false, message: "org_id query parameter is required." });
  }

  // Default to one year of data from the current date.
  const currentDate = moment().utc().endOf("day");
  const defaultFromDate = currentDate
    .clone()
    .subtract(1, "year")
    .startOf("day");

  // Parse 'from' and 'to' dates, defaulting if not provided
  let fromDate = from?.trim();
  let toDate = to?.trim();

  let dateFrom =
    fromDate && fromDate?.length > 0
      ? moment.utc(from).startOf("day")
      : defaultFromDate;

  let dateTo =
    toDate && toDate?.length > 0 ? moment.utc(to).endOf("day") : currentDate;

  // Enforce minimum 1-day range
  if (dateTo.isSameOrBefore(dateFrom)) {
    logger.warn("Invalid date range provided. Using default 1-year range.", {
      from,
      to,
    });
    dateFrom = defaultFromDate;
    dateTo = currentDate;
  }

  // Convert dates to Unix timestamps in milliseconds
  const fromTimestampMs = dateFrom.valueOf();
  const toTimestampMs = dateTo.valueOf();

  logger.info("CallAnalytics Date Range", {
    from: dateFrom.format("YYYY-MM-DD"),
    to: dateTo.format("YYYY-MM-DD"),
  });

  // Building the WHERE clause dynamically
  let whereClause = "WHERE ";
  let queryParams = [];
  let paramIndex = 1;

  // ORG_ID Filter
  whereClause += `org_id = $${paramIndex}`;
  queryParams.push(org_id);
  paramIndex++;

  // Date Filter
  whereClause += ` AND date >= $${paramIndex} AND date <= $${paramIndex + 1}`;

  // to prevent the pg driver from converting it to an ISO string.
  queryParams.push(String(fromTimestampMs), String(toTimestampMs));
  paramIndex += 2;

  // Agent Name Filter (Optional)

  let agentName = agent_name.trim();

  if (agentName) {
    whereClause += ` AND agent_name ILIKE $${paramIndex}`;
    queryParams.push(`%${agentName}%`);
    paramIndex++;
    logger.info("Filtering CallAnalytics by Agent Name.", {
      agent_name: agentName,
    });
  }

  // SQL queries
  // --- Query for Summary and Aggregate Counts ---
  const simpleSummaryQuery = `
      SELECT
          COUNT(*) AS total_calls,
          ROUND(AVG(total_duration_seconds::NUMERIC)) AS average_call_duration, 
          ROUND(AVG(latency_e2e_p50::NUMERIC)) AS average_latency,        
          TO_CHAR(MIN(TO_TIMESTAMP(
              CASE WHEN date ~ '^[0-9]+$' THEN date::BIGINT ELSE NULL END / 1000
             )), 'YYYY-MM-DD') AS date_start,
             TO_CHAR(MAX(TO_TIMESTAMP(
              CASE WHEN date ~ '^[0-9]+$' THEN date::BIGINT ELSE NULL END / 1000
             )), 'YYYY-MM-DD') AS date_end,
          SUM(CASE WHEN call_successful = TRUE THEN 1 ELSE 0 END) AS successful_calls,
          SUM(CASE WHEN call_successful = FALSE THEN 1 ELSE 0 END) AS unsuccessful_calls
      FROM calls
      ${whereClause}`;

  // Query : Global Aggregates (Need to pass parameters here too)
  const disconnectionQuery = `
      SELECT jsonb_object_agg(disconnection_reason, count) AS reasons
      FROM (
          SELECT disconnection_reason, COUNT(*) AS count 
          FROM calls 
          ${whereClause} 
          AND disconnection_reason IS NOT NULL 
          GROUP BY disconnection_reason
      ) AS sub;
  `;
  const sentimentQuery = `
      SELECT jsonb_object_agg(user_sentiment, count) AS sentiments
      FROM (
          SELECT user_sentiment, COUNT(*) AS count 
          FROM calls 
          ${whereClause} 
          AND user_sentiment IS NOT NULL 
          GROUP BY user_sentiment
      ) AS sub;
  `;
  const directionQuery = `
      SELECT jsonb_object_agg(direction, count) AS directions
      FROM (
          SELECT direction, COUNT(*) AS count 
          FROM calls 
          ${whereClause} 
          AND direction IS NOT NULL 
          GROUP BY direction
      ) AS sub;
  `;

  // Query : Daily Summary (Main Time Series Data)
  const dailySummaryQuery = `
      SELECT
          TO_CHAR(TO_TIMESTAMP(CASE WHEN date ~ '^[0-9]+$' THEN date::BIGINT ELSE NULL END / 1000), 'YYYY-MM-DD') AS call_date,
          COUNT(*) AS total_calls,
          SUM(CASE WHEN call_successful = TRUE THEN 1 ELSE 0 END) AS successful_calls,
          SUM(CASE WHEN call_successful = FALSE THEN 1 ELSE 0 END) AS unsuccessful_calls,
          SUM(CASE WHEN in_voicemail = TRUE THEN 1 ELSE 0 END) AS voicemail_count,
          SUM(CASE WHEN disconnection_reason = 'call_transfer' THEN 1 ELSE 0 END) AS transfer_count,
          SUM(CASE WHEN in_voicemail = FALSE THEN 1 ELSE 0 END) AS picked_up_count,
          ROUND(AVG(total_duration_seconds::NUMERIC)) AS avg_duration_seconds,
          ROUND(AVG(latency_e2e_p50::NUMERIC)) AS avg_latency_ms,
          
          jsonb_build_object(
              'negative', SUM(CASE WHEN user_sentiment = 'Negative' THEN 1 ELSE 0 END),
              'positive', SUM(CASE WHEN user_sentiment = 'Positive' THEN 1 ELSE 0 END),
              'neutral', SUM(CASE WHEN user_sentiment = 'Neutral' THEN 1 ELSE 0 END),
              'unknown', SUM(CASE WHEN user_sentiment IS NULL OR user_sentiment = 'Unknown' THEN 1 ELSE 0 END)
          ) AS sentiment_counts
      FROM
          calls
          ${whereClause}
      GROUP BY
          call_date
      ORDER BY
          call_date ASC;
  `;

  // Query : Daily Disconnection Reasons
  const dailyDisconnectionQuery = `
      SELECT
          TO_CHAR(TO_TIMESTAMP(CASE WHEN date ~ '^[0-9]+$' THEN date::BIGINT ELSE NULL END / 1000), 'YYYY-MM-DD') AS call_date,
          jsonb_object_agg(disconnection_reason, count) AS disconnection_reasons
      FROM (
          SELECT
              date,
              disconnection_reason,
              COUNT(*) AS count
          FROM
              calls
              ${whereClause}
              AND disconnection_reason IS NOT NULL
              GROUP BY
              date, disconnection_reason
      ) AS sub
      GROUP BY
          call_date
      ORDER BY
          call_date ASC;
  `;

  // Query : Agent Performance
  const agentQuery = `
      SELECT
      agent_id,
      agent_name,
      COUNT(*) AS total_calls,
      SUM(CASE WHEN call_successful = TRUE THEN 1 ELSE 0 END) AS successful_calls,
      SUM(CASE WHEN call_successful = FALSE THEN 1 ELSE 0 END) AS unsuccessful_calls,
      SUM(CASE WHEN in_voicemail = FALSE THEN 1 ELSE 0 END) AS picked_up_calls,
      SUM(CASE WHEN disconnection_reason = 'call_transfer' THEN 1 ELSE 0 END) AS transferred_calls
      FROM
      calls
      ${whereClause} 
      AND agent_id IS NOT NULL 
      GROUP BY
      agent_id, agent_name
      ORDER BY
      successful_calls DESC;
  `;

  const queries = [
    simpleSummaryQuery,
    disconnectionQuery,
    sentimentQuery,
    directionQuery,
    dailySummaryQuery,
    dailyDisconnectionQuery,
    agentQuery,
  ];

  try {
    // --- Execute all queries concurrently ---
    const results = await Promise.all(
      queries.map((q) => db.query(q, queryParams))
    );

    // Destructure results
    const [
      summaryResult,
      disconnectionResult,
      sentimentResult,
      directionResult,
      dailySummaryResults,
      dailyDisconnectionResults,
      agentResults,
    ] = results;

    // --- Data Assembly ---

    const summaryRow = summaryResult.rows[0];
    const totalCalls = Number(summaryRow.total_calls || 0);

    // Map disconnection reasons for easy lookup
    const dailyDisconnectionMap = dailyDisconnectionResults.rows.reduce(
      (map, row) => {
        map[row.call_date] = row.disconnection_reasons;
        return map;
      },
      {}
    );

    const finalResponse = {
      summary: {
        totalCalls: totalCalls,
        averageCallDuration: Number(summaryRow.average_call_duration || 0),
        averageLatency: Number(summaryRow.average_latency || 0),
        dateRange: {
          //start: summaryRow.date_start,
          start: dateFrom.format("YYYY-MM-DD"),
          end: dateTo.format("YYYY-MM-DD"),
          //end: summaryRow.date_end,
        },
      },
      callSuccessRate: {
        successful: Number(summaryRow.successful_calls || 0),
        unsuccessful: Number(summaryRow.unsuccessful_calls || 0),
      },
      disconnectionReasons: disconnectionResult.rows[0]?.reasons || {},
      userSentiment: sentimentResult.rows[0]?.sentiments || {},
      phoneDirection: directionResult.rows[0]?.directions || {},
      timeSeriesData: {
        callCounts: [],
        callPickupRate: [],
        callSuccessfulRate: [],
        callTransferRate: [],
        voicemailRate: [],
        averageCallDuration: [],
        averageLatency: [],
      },
      dailyBreakdown: [],
      agentPerformance: [],
    };

    // Process Daily Summary Results
    for (const row of dailySummaryResults.rows) {
      const date = row.call_date;
      const total = Number(row.total_calls);
      const successful = Number(row.successful_calls);
      const unsuccessful = Number(row.unsuccessful_calls);
      const pickedUp = Number(row.picked_up_count);
      const transferCount = Number(row.transfer_count);
      const voicemailCount = Number(row.voicemail_count);

      // Time Series Data
      finalResponse.timeSeriesData.callCounts.push({
        date: date,
        value: total,
      });
      finalResponse.timeSeriesData.callSuccessfulRate.push({
        date: date,
        value: calculatePercentage(successful, total),
      });
      finalResponse.timeSeriesData.callTransferRate.push({
        date: date,
        value: calculatePercentage(transferCount, total),
      });
      finalResponse.timeSeriesData.voicemailRate.push({
        date: date,
        value: calculatePercentage(voicemailCount, total),
      });
      finalResponse.timeSeriesData.callPickupRate.push({
        date: date,
        value: calculatePercentage(pickedUp, total),
      });

      finalResponse.timeSeriesData.averageCallDuration.push({
        date: date,
        value: Number(row.avg_duration_seconds),
      });
      finalResponse.timeSeriesData.averageLatency.push({
        date: date,
        value: Number(row.avg_latency_ms),
      });

      // Daily Breakdown
      finalResponse.dailyBreakdown.push({
        date: date,
        successful: successful,
        unsuccessful: unsuccessful,
        disconnectionReasons: dailyDisconnectionMap[date] || {},
        sentiment: row.sentiment_counts || {},
      });
    }

    // Process Agent Performance Results
    for (const row of agentResults.rows) {
      const total = Number(row.total_calls);
      const successful = Number(row.successful_calls);
      const unsuccessful = Number(row.unsuccessful_calls);
      const pickedUp = Number(row.picked_up_calls);
      const transferred = Number(row.transferred_calls);

      finalResponse.agentPerformance.push({
        agentId: row.agent_id,
        agentName: row.agent_name,
        callSuccessful: {
          successful: successful,
          unsuccessful: unsuccessful,
          percentage: calculatePercentage(successful, total),
        },
        callPickupRate: {
          pickedUp: pickedUp,
          total: total,
          percentage: calculatePercentage(pickedUp, total),
        },
        callTransferRate: {
          transferred: transferred,
          total: total,
          percentage: calculatePercentage(transferred, total),
        },
      });
    }

    res.status(200).json({ status: true, data: finalResponse });
  } catch (err) {
    logger.error("Database query error:", {
      error: err.message,
      stack: err.stack,
    });
    res.status(500).json({
      success: false,
      error: "Failed to retrieve call data from database.",
    });
  }
});

module.exports = router;
