'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');

const outputArg = process.argv[2] || '.promptfoo-output.json';
const country = process.argv[3];

if (!country) {
  console.error('Error: country shortname is required. Usage: node scripts/report.js <output.json> <country>');
  console.error('Example: npm run start:text --country=cn');
  process.exit(1);
}

const outputPath = path.isAbsolute(outputArg)
  ? outputArg
  : path.join(__dirname, '..', outputArg);

if (!fs.existsSync(outputPath)) {
  console.log(`No Promptfoo output found at ${outputPath}. Run the benchmark first.`);
  process.exit(0);
}

// Derive a short type name from the input file: text / asr / tts
const inputBasename = path.basename(outputArg, '.json'); // e.g. 'text', 'asr', 'tts'
const reportType = ['asr', 'tts'].includes(inputBasename) ? inputBasename : 'text';

const saveDir = path.join(__dirname, '..', 'output', country);
fs.mkdirSync(saveDir, { recursive: true });

const data = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
const prompts = data?.results?.prompts ?? [];
const rawResults = data?.results?.results ?? [];

if (!prompts.length) {
  console.log('No prompt results found in output.');
  process.exit(0);
}

const { summaries: errorSummaries, orderedKeys: rawResultKeys } = buildErrorSummaries(rawResults);
const reportEntries = [];
const seenEntries = new Set();

for (const entry of prompts) {
  const provider = entry.provider ?? 'unknown';
  const prompt = shortPromptLabel(entry.label ?? entry.raw);
  const key = entryKey(provider, prompt);

  reportEntries.push({
    key,
    provider,
    prompt,
    metrics: entry.metrics ?? {},
  });
  seenEntries.add(key);
}

for (const key of rawResultKeys) {
  if (seenEntries.has(key)) {
    continue;
  }

  const summary = errorSummaries.get(key);

  reportEntries.push({
    key,
    provider: summary?.provider ?? 'unknown',
    prompt: summary?.prompt ?? 'unknown',
    metrics: {},
  });
}

const AVG_METRICS = [
  { key: 'avg_total_latency_ms', countKey: 'total_latency_ms_count', label: 'avg total latency', unit: 'ms' },
  { key: 'avg_ttft_ms', countKey: 'ttft_ms_count', label: 'avg TTFT', unit: 'ms' },
  { key: 'avg_output_tokens_per_second', countKey: 'output_tokens_per_second_count', label: 'avg tokens/sec', unit: 'tok/s' },
  { key: 'avg_completion_tokens', countKey: 'completion_tokens_count', label: 'avg completion tokens', unit: 'tokens' },
  { key: 'avg_audio_bytes_per_second', countKey: 'audio_bytes_per_second_count', label: 'avg audio bytes/sec', unit: 'B/s' },
  { key: 'avg_audio_bytes', countKey: 'audio_bytes_count', label: 'avg audio bytes', unit: 'bytes' },
  { key: 'avg_input_characters', countKey: 'input_characters_count', label: 'avg input characters', unit: 'chars' },
];

function shortPromptLabel(label) {
  // Extract just the filename from labels like "prompts/ttft.txt: ..."
  const match = label?.match(/^([\w./-]+\.txt)/);

  if (!match) {
    return (label ?? '').slice(0, 50);
  }

  return path.isAbsolute(match[1]) ? path.relative(repoRoot, match[1]) : match[1];
}

function entryKey(provider, prompt) {
  return `${provider}\u0000${prompt}`;
}

function rawResultProvider(result) {
  return result?.provider?.label ?? result?.provider?.id ?? 'unknown';
}

function rawResultPrompt(result) {
  return shortPromptLabel(result?.prompt?.label ?? result?.prompt?.raw);
}

function cleanErrorMessage(message) {
  if (!message) return 'Unknown error';

  return String(message)
    .replace(/\s+/g, ' ')
    .replace(/^Request failed for [^:]+:\s*/i, '')
    .replace(/^Request failed with \d+:\s*/i, '')
    .replace(/^Request failed:\s*/i, '')
    .trim();
}

function buildErrorSummaries(results) {
  const summaries = new Map();
  const orderedKeys = [];

  for (const result of results) {
    const provider = rawResultProvider(result);
    const prompt = rawResultPrompt(result);
    const key = entryKey(provider, prompt);
    let summary = summaries.get(key);

    if (!summary) {
      summary = {
        provider,
        prompt,
        totalCount: 0,
        errorCount: 0,
        messages: new Map(),
      };
      summaries.set(key, summary);
      orderedKeys.push(key);
    }

    summary.totalCount += 1;

    if (result?.success === false) {
      summary.errorCount += 1;

      const message = cleanErrorMessage(result?.error ?? result?.response?.error);
      summary.messages.set(message, (summary.messages.get(message) ?? 0) + 1);
    }
  }

  return { summaries, orderedKeys };
}

function formatErrorSummary(summary, metrics) {
  const errorCount = summary?.errorCount ?? metrics?.testErrorCount ?? 0;

  if (!errorCount) {
    return null;
  }

  const totalCount = summary?.totalCount
    ?? ((metrics?.testPassCount ?? 0) + (metrics?.testFailCount ?? 0) + (metrics?.testErrorCount ?? 0));

  const messages = summary
    ? (() => {
      const entries = [...summary.messages.entries()];

      if (entries.length === 1) {
        return entries[0][0];
      }

      return entries
        .map(([message, count]) => (count > 1 ? `${count}x ${message}` : message))
        .join(' | ');
    })()
    : 'Unknown error';

  return totalCount > 0
    ? `${errorCount}/${totalCount} failed - ${messages || 'Unknown error'}`
    : (messages || 'Unknown error');
}

function fmt(value) {
  if (value === undefined || value === null) return 'n/a';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

const separator = '─'.repeat(60);

const lines = [];
const emit = (line = '') => { lines.push(line); console.log(line); };

emit('\n' + separator);
emit('  Benchmark Named Scores');
emit(separator);

for (const entry of reportEntries) {
  const { key, provider, prompt, metrics } = entry;
  const scores = metrics.namedScores ?? {};
  const visibleMetrics = AVG_METRICS.filter(({ key: scoreKey, countKey }) => {
    const value = scores[scoreKey];
    const count = countKey ? (scores[countKey] ?? 0) : 1;
    return value !== undefined && count > 0;
  });
  const errorSummary = formatErrorSummary(errorSummaries.get(key), metrics);

  emit(`\n  Provider : ${provider}`);
  emit(`  Prompt   : ${prompt}`);

  for (const { key: scoreKey, countKey, label, unit } of visibleMetrics) {
    const value = scores[scoreKey];
    const count = countKey ? (scores[countKey] ?? 0) : 1;
    const display = value !== undefined && count > 0 ? `${fmt(value)} ${unit}` : 'n/a';
    emit(`    ${label.padEnd(28)}: ${display}`);
  }

  if (errorSummary) {
    const errorCount = metrics.testErrorCount ?? errorSummaries.get(key)?.errorCount ?? 0;
    const errorLabel = errorCount === 1 ? 'error' : 'errors';
    emit(`    ${errorLabel.padEnd(28)}: ${errorSummary}`);
  }

  if (!visibleMetrics.length && !errorSummary) {
    emit(`    ${'status'.padEnd(28)}: no successful benchmark samples`);
  }
}

emit('\n' + separator + '\n');

// Save the text report to output/<country>/
const savedTxtPath = path.join(saveDir, `${reportType}.txt`);
fs.writeFileSync(savedTxtPath, lines.join('\n') + '\n', 'utf-8');
console.log(`Text report saved  → output/${country}/${reportType}.txt`);
