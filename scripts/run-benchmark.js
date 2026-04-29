'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const [, , configArg, outputArg, country] = process.argv;

if (!configArg || !outputArg || !country) {
  console.error('Error: config path, output path, and country are required.');
  console.error('Usage: node scripts/run-benchmark.js <config> <output.json> <country>');
  process.exit(1);
}

const repoRoot = path.join(__dirname, '..');
const configPath = path.isAbsolute(configArg) ? configArg : path.join(repoRoot, configArg);
const outputPath = path.isAbsolute(outputArg) ? outputArg : path.join(repoRoot, outputArg);
const localPromptfooBin = path.join(
  repoRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'promptfoo.cmd' : 'promptfoo',
);
const promptfooCommand = fs.existsSync(localPromptfooBin)
  ? localPromptfooBin
  : (process.platform === 'win32' ? 'promptfoo.cmd' : 'promptfoo');

fs.mkdirSync(path.dirname(outputPath), { recursive: true });

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
}

const cacheClearExitCode = run(promptfooCommand, ['cache', 'clear']);

if (cacheClearExitCode !== 0) {
  process.exit(cacheClearExitCode);
}

const benchmarkExitCode = run(promptfooCommand, ['eval', '-c', configPath, '--output', outputPath]);
const reportExitCode = run(process.execPath, [path.join(__dirname, 'report.js'), outputPath, country]);

process.exit(reportExitCode !== 0 ? reportExitCode : benchmarkExitCode);