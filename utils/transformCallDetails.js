// const transformCallDetails = (rawData) => {
//   if (!Array.isArray(rawData)) return {};

//   const summary = {
//     totalCalls: rawData.length,
//     averageCallDuration: 0,
//     averageLatency: 0,
//     dateRange: { start: null, end: null },
//   };

//   const callSuccessRate = { successful: 0, unsuccessful: 0 };
//   const disconnectionReasons = {};
//   const userSentiment = { negative: 0, positive: 0, neutral: 0, unknown: 0 };
//   const phoneDirection = { inbound: 0, outbound: 0 };

//   const dailyMap = new Map();
//   const agentMap = new Map();
//   const callDurations = [];
//   const latencies = [];

//   for (const call of rawData) {
//     // ----  Basic totals ----
//     const date = call.call_start ? call.call_start.split("T")[0] : null;
//     const isSuccess = call.call_status === "successful";
//     const duration = call.call_duration_ms || 0;
//     const latency = call.latency_ms || 0;
//     const reason = call.disconnection_reason || "unknown";
//     const sentiment = call.user_sentiment || "unknown";
//     const direction = call.call_direction || "unknown";

//     callDurations.push(duration);
//     latencies.push(latency);

//     // ----    Success counts ----
//     isSuccess ? callSuccessRate.successful++ : callSuccessRate.unsuccessful++;

//     // ----   Disconnection reasons ----
//     disconnectionReasons[reason] = (disconnectionReasons[reason] || 0) + 1;

//     // ----    Sentiment ----
//     userSentiment[sentiment] = (userSentiment[sentiment] || 0) + 1;

//     // ----    Direction ----
//     if (direction === "inbound") phoneDirection.inbound++;
//     else if (direction === "outbound") phoneDirection.outbound++;

//     // ----  Daily breakdown ----
//     if (date) {
//       if (!dailyMap.has(date)) {
//         dailyMap.set(date, {
//           date,
//           successful: 0,
//           unsuccessful: 0,
//           disconnectionReasons: {},
//           sentiment: { negative: 0, positive: 0, neutral: 0, unknown: 0 },
//         });
//       }
//       const d = dailyMap.get(date);
//       if (isSuccess) d.successful++;
//       else d.unsuccessful++;
//       d.disconnectionReasons[reason] =
//         (d.disconnectionReasons[reason] || 0) + 1;
//       d.sentiment[sentiment] = (d.sentiment[sentiment] || 0) + 1;
//     }

//     // ----   Agent performance ----
//     if (call.agent_id) {
//       if (!agentMap.has(call.agent_id)) {
//         agentMap.set(call.agent_id, {
//           agentId: call.agent_id,
//           agentName: call.agent_name || call.agent_id,
//           callSuccessful: { successful: 0, unsuccessful: 0, percentage: 0 },
//           callPickupRate: { pickedUp: 0, total: 0, percentage: 0 },
//           callTransferRate: { transferred: 0, total: 0, percentage: 0 },
//         });
//       }
//       const ag = agentMap.get(call.agent_id);
//       if (isSuccess) ag.callSuccessful.successful++;
//       else ag.callSuccessful.unsuccessful++;
//       ag.callPickupRate.total++;
//       if (call.picked_up) ag.callPickupRate.pickedUp++;
//       if (call.transferred) ag.callTransferRate.transferred++;
//       ag.callTransferRate.total++;
//     }
//   }

//   // ----  Compute averages ----
//   summary.averageCallDuration = Math.round(
//     callDurations.reduce((a, b) => a + b, 0) / callDurations.length || 0
//   );
//   summary.averageLatency = Math.round(
//     latencies.reduce((a, b) => a + b, 0) / latencies.length || 0
//   );

//   const allDates = Array.from(dailyMap.keys()).sort();
//   summary.dateRange.start = allDates[0];
//   summary.dateRange.end = allDates[allDates.length - 1];

//   // ----  Agent performance rates ----
//   for (const ag of agentMap.values()) {
//     ag.callSuccessful.percentage = Number(
//       (
//         (ag.callSuccessful.successful /
//           (ag.callSuccessful.successful + ag.callSuccessful.unsuccessful ||
//             1)) *
//         100
//       ).toFixed(1)
//     );
//     ag.callPickupRate.percentage = Number(
//       (
//         (ag.callPickupRate.pickedUp / (ag.callPickupRate.total || 1)) *
//         100
//       ).toFixed(1)
//     );
//     ag.callTransferRate.percentage = Number(
//       (
//         (ag.callTransferRate.transferred / (ag.callTransferRate.total || 1)) *
//         100
//       ).toFixed(1)
//     );
//   }

//   // ----  Assemble final payload ----
//   return {
//     summary,
//     callSuccessRate,
//     disconnectionReasons,
//     userSentiment,
//     phoneDirection,
//     timeSeriesData: {},
//     dailyBreakdown: Array.from(dailyMap.values()),
//     agentPerformance: Array.from(agentMap.values()),
//   };
// };

//import _ from "lodash";

/**
 * Transform raw call data (response2) into response1 analytics format
 * @param {Array<Object>} calls - raw call records
 */
// function transformCallDetails(calls = []) {
//   if (!Array.isArray(calls) || calls.length === 0) return {};

//   const summary = {
//     totalCalls: calls.length,
//     averageCallDuration: 0,
//     averageLatency: 0,
//     dateRange: { start: null, end: null },
//   };

//   const callSuccessRate = { successful: 0, unsuccessful: 0 };
//   const disconnectionReasons = {};
//   const userSentiment = { negative: 0, positive: 0, neutral: 0, unknown: 0 };
//   const phoneDirection = { inbound: 0, outbound: 0 };

//   const timeSeriesMap = {};
//   const dailyMap = {};
//   const agentMap = {};

//   let durationSum = 0;
//   let latencySum = 0;

//   for (const call of calls) {
//     const date = call.call_start_time
//       ? call.call_start_time.split("T")[0]
//       : call.call_date || "unknown";

//     // --- Basic metrics
//     const isSuccessful = call.call_successful === true;
//     const duration = Number(call.call_duration_ms || 0);
//     const latency = Number(call.latency_ms || 0);
//     const reason = call.disconnection_reason || "unknown";
//     const sentiment = call.sentiment || "unknown";
//     const direction = call.call_direction || "unknown";
//     const agentId = call.agent_id || "unknown";
//     const agentName = call.agent_name || agentId;

//     durationSum += duration;
//     latencySum += latency;

//     // --- Success Rate
//     isSuccessful
//       ? callSuccessRate.successful++
//       : callSuccessRate.unsuccessful++;

//     // --- Disconnection reasons
//     disconnectionReasons[reason] = (disconnectionReasons[reason] || 0) + 1;

//     // --- Sentiment
//     userSentiment[sentiment] = (userSentiment[sentiment] || 0) + 1;

//     // --- Direction
//     if (direction === "inbound") phoneDirection.inbound++;
//     else if (direction === "outbound") phoneDirection.outbound++;

//     // --- Daily breakdown
//     if (!dailyMap[date]) {
//       dailyMap[date] = {
//         date,
//         successful: 0,
//         unsuccessful: 0,
//         disconnectionReasons: {},
//         sentiment: { negative: 0, positive: 0, neutral: 0, unknown: 0 },
//       };
//     }
//     const d = dailyMap[date];
//     isSuccessful ? d.successful++ : d.unsuccessful++;
//     d.disconnectionReasons[reason] = (d.disconnectionReasons[reason] || 0) + 1;
//     d.sentiment[sentiment] = (d.sentiment[sentiment] || 0) + 1;

//     // --- Time series aggregations
//     if (!timeSeriesMap[date]) {
//       timeSeriesMap[date] = {
//         callCounts: 0,
//         callPickupRate: { picked: 0, total: 0 },
//         callTransferRate: { transferred: 0, total: 0 },
//         voicemailRate: { voicemail: 0, total: 0 },
//         callSuccessfulRate: { successful: 0, total: 0 },
//         averageCallDuration: { total: 0, count: 0 },
//         averageLatency: { total: 0, count: 0 },
//       };
//     }

//     const ts = timeSeriesMap[date];
//     ts.callCounts++;
//     ts.callPickupRate.total++;
//     ts.callTransferRate.total++;
//     ts.voicemailRate.total++;
//     ts.callSuccessfulRate.total++;
//     ts.averageCallDuration.total += duration;
//     ts.averageCallDuration.count++;
//     ts.averageLatency.total += latency;
//     ts.averageLatency.count++;

//     if (call.picked_up) ts.callPickupRate.picked++;
//     if (call.transferred) ts.callTransferRate.transferred++;
//     if (call.disconnection_reason === "voicemailReached")
//       ts.voicemailRate.voicemail++;
//     if (isSuccessful) ts.callSuccessfulRate.successful++;

//     // --- Agent Performance
//     if (!agentMap[agentId]) {
//       agentMap[agentId] = {
//         agentId,
//         agentName,
//         callSuccessful: { successful: 0, unsuccessful: 0, percentage: 0 },
//         callPickupRate: { pickedUp: 0, total: 0, percentage: 0 },
//         callTransferRate: { transferred: 0, total: 0, percentage: 0 },
//       };
//     }
//     const ag = agentMap[agentId];
//     isSuccessful
//       ? ag.callSuccessful.successful++
//       : ag.callSuccessful.unsuccessful++;
//     if (call.picked_up) ag.callPickupRate.pickedUp++;
//     ag.callPickupRate.total++;
//     if (call.transferred) ag.callTransferRate.transferred++;
//     ag.callTransferRate.total++;
//   }

//   // --- Compute Summary Averages
//   summary.averageCallDuration = Math.round(durationSum / calls.length || 0);
//   summary.averageLatency = Math.round(latencySum / calls.length || 0);
//   const sortedDates = Object.keys(dailyMap).sort();
//   summary.dateRange.start = sortedDates[0];
//   summary.dateRange.end = sortedDates[sortedDates.length - 1];

//   // --- Compute Agent Stats
//   const agentPerformance = Object.values(agentMap).map((ag) => {
//     ag.callSuccessful.percentage = Number(
//       (
//         (ag.callSuccessful.successful /
//           (ag.callSuccessful.successful + ag.callSuccessful.unsuccessful ||
//             1)) *
//         100
//       ).toFixed(1)
//     );
//     ag.callPickupRate.percentage = Number(
//       (
//         (ag.callPickupRate.pickedUp / (ag.callPickupRate.total || 1)) *
//         100
//       ).toFixed(1)
//     );
//     ag.callTransferRate.percentage = Number(
//       (
//         (ag.callTransferRate.transferred / (ag.callTransferRate.total || 1)) *
//         100
//       ).toFixed(1)
//     );
//     return ag;
//   });

//   // --- Build time series arrays
//   const timeSeriesData = {
//     callCounts: [],
//     callPickupRate: [],
//     callSuccessfulRate: [],
//     callTransferRate: [],
//     voicemailRate: [],
//     averageCallDuration: [],
//     averageLatency: [],
//   };

//   for (const [date, v] of Object.entries(timeSeriesMap)) {
//     timeSeriesData.callCounts.push({ date, value: v.callCounts });
//     timeSeriesData.callPickupRate.push({
//       date,
//       value: Number(
//         ((v.callPickupRate.picked / v.callPickupRate.total) * 100).toFixed(1)
//       ),
//     });
//     timeSeriesData.callSuccessfulRate.push({
//       date,
//       value: Number(
//         (
//           (v.callSuccessfulRate.successful / v.callSuccessfulRate.total) *
//           100
//         ).toFixed(1)
//       ),
//     });
//     timeSeriesData.callTransferRate.push({
//       date,
//       value: Number(
//         (
//           (v.callTransferRate.transferred / v.callTransferRate.total) *
//           100
//         ).toFixed(1)
//       ),
//     });
//     timeSeriesData.voicemailRate.push({
//       date,
//       value: Number(
//         ((v.voicemailRate.voicemail / v.voicemailRate.total) * 100).toFixed(1)
//       ),
//     });
//     timeSeriesData.averageCallDuration.push({
//       date,
//       value: Math.round(
//         v.averageCallDuration.total / (v.averageCallDuration.count || 1)
//       ),
//     });
//     timeSeriesData.averageLatency.push({
//       date,
//       value: Math.round(v.averageLatency.total / (v.averageLatency.count || 1)),
//     });
//   }

//   // --- Final payload
//   return {
//     summary,
//     callSuccessRate,
//     disconnectionReasons,
//     userSentiment,
//     phoneDirection,
//     timeSeriesData,
//     dailyBreakdown: Object.values(dailyMap),
//     agentPerformance,
//   };
// }

// const _  = require("lodash");

/**
 * Transform raw call records (Response 2) into analytics format (Response 1)
 * @param {Array<Object>} calls
 * @param {Object} [filter={ startDate?: string, endDate?: string }]
 */
// function transformCallDetails(calls = [], filter = {}) {
//   if (!Array.isArray(calls) || calls.length === 0) return {};

//   // --- Apply date filtering
//   const filteredCalls = calls.filter((call) => {
//     const startTime = call.start_time || call.call_start_time || call.timestamp;
//     if (!startTime) return false;
//     const callDate = new Date(startTime);
//     if (filter.startDate && callDate < new Date(filter.startDate)) return false;
//     if (filter.endDate && callDate > new Date(filter.endDate)) return false;
//     return true;
//   });

//   const finalCalls = filteredCalls.length ? filteredCalls : calls;

//   const summary = {
//     totalCalls: finalCalls.length,
//     averageCallDuration: 0,
//     averageLatency: 0,
//     dateRange: { start: null, end: null },
//   };

//   const callSuccessRate = { successful: 0, unsuccessful: 0 };
//   const disconnectionReasons = {};
//   const userSentiment = { negative: 0, positive: 0, neutral: 0, unknown: 0 };
//   const phoneDirection = { inbound: 0, outbound: 0 };

//   const timeSeriesMap = {};
//   const dailyMap = {};
//   const agentMap = {};

//   let durationSum = 0;
//   let latencySum = 0;

//   for (const call of finalCalls) {
//     // --- Map real fields
//     const dateRaw =
//       call.start_time ||
//       call.call_start_time ||
//       call.timestamp ||
//       call.created_at;
//     const date = dateRaw ? dateRaw.split("T")[0] : "unknown";

//     const duration = Number(call.duration_ms || call.call_duration_ms || 0);
//     const latency = Number(call.latency || call.latency_ms || 0);
//     const isSuccessful = Boolean(call.call_successful);
//     const direction = call.direction || call.call_direction || "unknown";
//     const sentiment = call.user_sentiment || call.sentiment || "unknown";
//     const reason = call.disconnect_reason || call.disconnection_reason || "unknown";
//     const pickedUp = Boolean(call.pickup_successful || call.picked_up);
//     const transferred = Boolean(call.transfer_successful || call.transferred);

//     const agentId =
//       (call.agent && call.agent.id) || call.agent_id || "unknown";
//     const agentName =
//       (call.agent && call.agent.name) || call.agent_name || agentId;

//     // --- Aggregate values
//     durationSum += duration;
//     latencySum += latency;

//     if (isSuccessful) callSuccessRate.successful++;
//     else callSuccessRate.unsuccessful++;

//     disconnectionReasons[reason] = (disconnectionReasons[reason] || 0) + 1;
//     userSentiment[sentiment] = (userSentiment[sentiment] || 0) + 1;

//     if (direction === "inbound") phoneDirection.inbound++;
//     else if (direction === "outbound") phoneDirection.outbound++;

//     // --- Daily breakdown
//     if (!dailyMap[date]) {
//       dailyMap[date] = {
//         date,
//         successful: 0,
//         unsuccessful: 0,
//         disconnectionReasons: {},
//         sentiment: { negative: 0, positive: 0, neutral: 0, unknown: 0 },
//       };
//     }

//     const d = dailyMap[date];
//     isSuccessful ? d.successful++ : d.unsuccessful++;
//     d.disconnectionReasons[reason] =
//       (d.disconnectionReasons[reason] || 0) + 1;
//     d.sentiment[sentiment] = (d.sentiment[sentiment] || 0) + 1;

//     // --- Time-series grouping
//     if (!timeSeriesMap[date]) {
//       timeSeriesMap[date] = {
//         callCounts: 0,
//         callPickupRate: { picked: 0, total: 0 },
//         callSuccessfulRate: { successful: 0, total: 0 },
//         callTransferRate: { transferred: 0, total: 0 },
//         voicemailRate: { voicemail: 0, total: 0 },
//         averageCallDuration: { total: 0, count: 0 },
//         averageLatency: { total: 0, count: 0 },
//       };
//     }

//     const ts = timeSeriesMap[date];
//     ts.callCounts++;
//     ts.callPickupRate.total++;
//     ts.callSuccessfulRate.total++;
//     ts.callTransferRate.total++;
//     ts.voicemailRate.total++;
//     ts.averageCallDuration.total += duration;
//     ts.averageCallDuration.count++;
//     ts.averageLatency.total += latency;
//     ts.averageLatency.count++;

//     if (pickedUp) ts.callPickupRate.picked++;
//     if (isSuccessful) ts.callSuccessfulRate.successful++;
//     if (transferred) ts.callTransferRate.transferred++;
//     if (reason === "voicemailReached") ts.voicemailRate.voicemail++;

//     // --- Agent performance
//     if (!agentMap[agentId]) {
//       agentMap[agentId] = {
//         agentId,
//         agentName,
//         callSuccessful: { successful: 0, unsuccessful: 0, percentage: 0 },
//         callPickupRate: { pickedUp: 0, total: 0, percentage: 0 },
//         callTransferRate: { transferred: 0, total: 0, percentage: 0 },
//       };
//     }

//     const ag = agentMap[agentId];
//     if (isSuccessful) ag.callSuccessful.successful++;
//     else ag.callSuccessful.unsuccessful++;
//     ag.callPickupRate.total++;
//     ag.callTransferRate.total++;
//     if (pickedUp) ag.callPickupRate.pickedUp++;
//     if (transferred) ag.callTransferRate.transferred++;
//   }

//   // --- Compute Summary Stats
//   summary.averageCallDuration = Math.round(durationSum / finalCalls.length || 0);
//   summary.averageLatency = Math.round(latencySum / finalCalls.length || 0);

//   const sortedDates = Object.keys(dailyMap).sort();
//   summary.dateRange.start = sortedDates[0] || "unknown";
//   summary.dateRange.end = sortedDates[sortedDates.length - 1] || "unknown";

//   // --- Agent performance percentages
//   const agentPerformance = Object.values(agentMap).map((a) => {
//     a.callSuccessful.percentage = Number(
//       ((a.callSuccessful.successful /
//         (a.callSuccessful.successful + a.callSuccessful.unsuccessful || 1)) *
//         100).toFixed(1)
//     );
//     a.callPickupRate.percentage = Number(
//       ((a.callPickupRate.pickedUp / (a.callPickupRate.total || 1)) * 100).toFixed(1)
//     );
//     a.callTransferRate.percentage = Number(
//       ((a.callTransferRate.transferred / (a.callTransferRate.total || 1)) * 100).toFixed(1)
//     );
//     return a;
//   });

//   // --- Time Series Arrays
//   const timeSeriesData = {
//     callCounts: [],
//     callPickupRate: [],
//     callSuccessfulRate: [],
//     callTransferRate: [],
//     voicemailRate: [],
//     averageCallDuration: [],
//     averageLatency: [],
//   };

//   for (const [date, v] of Object.entries(timeSeriesMap)) {
//     timeSeriesData.callCounts.push({ date, value: v.callCounts });
//     timeSeriesData.callPickupRate.push({
//       date,
//       value: Number(((v.callPickupRate.picked / v.callPickupRate.total) * 100).toFixed(1)),
//     });
//     timeSeriesData.callSuccessfulRate.push({
//       date,
//       value: Number(((v.callSuccessfulRate.successful / v.callSuccessfulRate.total) * 100).toFixed(1)),
//     });
//     timeSeriesData.callTransferRate.push({
//       date,
//       value: Number(((v.callTransferRate.transferred / v.callTransferRate.total) * 100).toFixed(1)),
//     });
//     timeSeriesData.voicemailRate.push({
//       date,
//       value: Number(((v.voicemailRate.voicemail / v.voicemailRate.total) * 100).toFixed(1)),
//     });
//     timeSeriesData.averageCallDuration.push({
//       date,
//       value: Math.round(v.averageCallDuration.total / (v.averageCallDuration.count || 1)),
//     });
//     timeSeriesData.averageLatency.push({
//       date,
//       value: Math.round(v.averageLatency.total / (v.averageLatency.count || 1)),
//     });
//   }

//   return {
//     summary,
//     callSuccessRate,
//     disconnectionReasons,
//     userSentiment,
//     phoneDirection,
//     timeSeriesData,
//     dailyBreakdown: Object.values(dailyMap),
//     agentPerformance,
//   };
// }

//  module.exports = transformCallDetails;

// Function to safely extract nested data and flatten it for the database update
const extractCallDetailsForUpdate = (callData) => {
  // Navigate to latency metrics, providing defaults if structure is missing
  const latency = callData.call?.latency || {};
  const e2eLatency = latency.e2e || {};
  const llmLatency = latency.llm || {};
  const ttsLatency = latency.tts || {};
  const sttLatency = latency.stt || {};

  const call = callData.call || {};
  // Navigate to analysis and cost data
  const analysis = callData.call?.call_analysis || {};
  const cost = callData.call?.call_cost || {};

  // Map extracted data to match your new table columns
  return {
    // From call_cost
    total_duration_seconds: cost.total_duration_seconds,

    date: call.start_timestamp,
    org_id: 3,
    retell_llm_dynamic_variables: call.retell_llm_dynamic_variables,
    // From latency metrics (P50 and P99)
    latency_e2e_p50: e2eLatency.p50,
    latency_e2e_p99: e2eLatency.p99,
    latency_llm_p50: llmLatency.p50,
    latency_llm_p99: llmLatency.p99,
    latency_tts_p50: ttsLatency.p50,
    latency_tts_p99: ttsLatency.p99,
    // Note: The provided JSON doesn't have stt, but we keep the structure
    latency_stt_p50: sttLatency.p50,
    latency_stt_p99: sttLatency.p99,

    // Direct fields
    agent_name: callData.call?.agent_name,
    agent_id: callData.call?.agent_id,
    direction: callData.call?.direction,
    call_type: callData.call?.call_type,
    disconnection_reason: callData.call?.disconnection_reason,

    // From call_analysis
    call_successful: analysis.call_successful,
    user_sentiment: analysis.user_sentiment,
    in_voicemail: analysis.in_voicemail,
    custom_analysis_data: analysis.custom_analysis_data, // Storing the full JSON object

    // Key needed for the WHERE clause in the SQL UPDATE
    call_id: callData.call?.call_id,
  };
};

module.exports = { extractCallDetailsForUpdate };
