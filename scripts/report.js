'use strict';

const fs = require('fs');
const path = require('path');

const outputPath = path.join(__dirname, '..', '.promptfoo-output.json');

if (!fs.existsSync(outputPath)) {
  console.log('No .promptfoo-output.json found. Run the benchmark first.');
  process.exit(0);
}

const data = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
const prompts = data?.results?.prompts ?? [];

if (!prompts.length) {
  console.log('No prompt results found in output.');
  process.exit(0);
}

const AVG_METRICS = [
  { key: 'avg_total_latency_ms', countKey: 'total_latency_ms_count', label: 'avg total latency', unit: 'ms' },
  { key: 'avg_ttft_ms', countKey: 'ttft_ms_count', label: 'avg TTFT', unit: 'ms' },
  { key: 'avg_output_tokens_per_second', countKey: 'output_tokens_per_second_count', label: 'avg tokens/sec', unit: 'tok/s' },
  { key: 'avg_completion_tokens', countKey: 'completion_tokens_count', label: 'avg completion tokens', unit: 'tokens' },
];

function shortPromptLabel(label) {
  // Extract just the filename from labels like "prompts/ttft.txt: ..."
  const match = label?.match(/^([\w./-]+\.txt)/);
  return match ? match[1] : (label ?? '').slice(0, 50);
}

function fmt(value) {
  if (value === undefined || value === null) return 'n/a';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

const separator = '─'.repeat(60);

console.log('\n' + separator);
console.log('  Benchmark Named Scores');
console.log(separator);

for (const entry of prompts) {
  const provider = entry.provider ?? 'unknown';
  const prompt = shortPromptLabel(entry.label ?? entry.raw);
  const scores = entry.metrics?.namedScores ?? {};

  console.log(`\n  Provider : ${provider}`);
  console.log(`  Prompt   : ${prompt}`);

  for (const { key, countKey, label, unit } of AVG_METRICS) {
    const value = scores[key];
    const count = countKey ? (scores[countKey] ?? 0) : 1;
    const display = value !== undefined && count > 0 ? `${fmt(value)} ${unit}` : 'n/a';
    console.log(`    ${label.padEnd(28)}: ${display}`);
  }
}

console.log('\n' + separator + '\n');
