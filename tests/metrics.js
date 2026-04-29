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

const METRIC_DEFINITIONS = [
  ['totalLatencyMs', 'total_latency_ms'],
  ['ttftMs', 'ttft_ms'],
  ['outputTokensPerSecond', 'output_tokens_per_second'],
  ['completionTokenCount', 'completion_tokens'],
  ['audioBytesPerSecond', 'audio_bytes_per_second'],
  ['audioByteCount', 'audio_bytes'],
  ['inputCharacterCount', 'input_characters'],
];

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
  const namedScores = {};

  for (const [metadataKey, metricKey] of METRIC_DEFINITIONS) {
    const value = metadataValue(context, metadataKey);
    namedScores[`${metricKey}_sum`] = metricOrZero(value);
    namedScores[`${metricKey}_count`] = metricCount(value);
  }

  return buildMetricResult(namedScores);
}

module.exports = {
  benchmarkMetrics,
};