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
    org_id: 3, // for now hardcoded for testing, no longer use
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
