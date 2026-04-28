function numericValue(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function metadataValue(context, key) {
  return numericValue(context?.providerResponse?.metadata?.[key]);
}

function metricOrZero(value) {
  return value ?? 0;
}

function metricCount(value) {
  return value === undefined ? 0 : 1;
}

function buildMetricResult(namedScores) {
  const namedScoreWeights = Object.fromEntries(
    Object.keys(namedScores).map((metricName) => [metricName, 1]),
  );

  return {
    pass: true,
    score: 1,
    reason: 'Collected benchmark metrics',
    namedScores,
    namedScoreWeights,
  };
}

function benchmarkMetrics(_output, context) {
  const totalLatencyMs = metadataValue(context, 'totalLatencyMs');
  const ttftMs = metadataValue(context, 'ttftMs');
  const outputTokensPerSecond = metadataValue(context, 'outputTokensPerSecond');
  const completionTokenCount = metadataValue(context, 'completionTokenCount');

  return buildMetricResult({
    total_latency_ms_sum: metricOrZero(totalLatencyMs),
    total_latency_ms_count: metricCount(totalLatencyMs),
    ttft_ms_sum: metricOrZero(ttftMs),
    ttft_ms_count: metricCount(ttftMs),
    output_tokens_per_second_sum: metricOrZero(outputTokensPerSecond),
    output_tokens_per_second_count: metricCount(outputTokensPerSecond),
    completion_tokens_sum: metricOrZero(completionTokenCount),
    completion_tokens_count: metricCount(completionTokenCount),
  });
}

module.exports = {
  benchmarkMetrics,
};