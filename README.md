# Promptfoo DashScope benchmarks

This workspace benchmarks DashScope text, ASR, and TTS models with Promptfoo.
Text uses `providers/dashscope-compatible.js`, while ASR and TTS use dedicated provider files so the original text provider stays isolated.

## Quick start

1. Put your API keys in `.env`.

```bash
DASHSCOPE_SG_API_KEY=sk-...
DASHSCOPE_US_API_KEY=sk-...
```

2. Validate the configs.

```bash
npm run validate
npm run validate:asr
npm run validate:tts
```

3. Run the benchmark you need.

```bash
npm run start
npm run start:asr
npm run start:tts
```

Each command writes a `.promptfoo-output*.json` file and prints an aggregated terminal report.

## Available benchmark configs

- `promptfooconfig.yaml`: existing text/chat benchmark for OpenAI-compatible DashScope endpoints.
- `promptfoo.asr.yaml`: Qwen3 ASR benchmark using `input_audio` requests over the OpenAI-compatible chat-completions API.
- `promptfoo.tts.yaml`: Qwen3 TTS benchmark using DashScope SSE audio streaming.

## Metrics

Text and ASR benchmarks report these averages:

- `avg_total_latency_ms`
- `avg_ttft_ms`
- `avg_output_tokens_per_second`
- `avg_completion_tokens`

TTS benchmarks report these averages:

- `avg_total_latency_ms`
- `avg_ttft_ms`
- `avg_audio_bytes_per_second`
- `avg_audio_bytes`
- `avg_input_characters`

The benchmark metrics are emitted as `namedScores` from `tests/metrics.js`, which avoids Promptfoo's assertion-weight aggregation issue for benchmark-only metrics.

## File layout

- `prompts/` contains the text prompt, ASR instruction prompt, and TTS source-text prompt.
- `providers/` contains per-model YAML files plus the shared custom provider.
- `tests/default-benchmark.yaml` attaches the metric assertion.
- `tests/benchmark-cases.yaml`, `tests/asr-benchmark-cases.yaml`, and `tests/tts-benchmark-cases.yaml` define the benchmark inputs.

## Notes

- The ASR benchmark can read local audio files from `test_data/` via `audio_file` in `tests/asr-benchmark-cases.yaml`; the provider converts them to base64 data URIs before sending the request.
- The TTS benchmark defaults to the `Cherry` voice on the Singapore HTTP API. Override `voice`, `language_type`, or the text cases in `tests/tts-benchmark-cases.yaml` as needed.
- When usage data is missing from a streamed text response, the provider falls back to a simple character-based token estimate so throughput still stays comparable.

## Learn more

- Configuration guide: https://promptfoo.dev/docs/configuration/guide
- Custom JavaScript providers: https://www.promptfoo.dev/docs/providers/custom-api/
- Alibaba Cloud streaming docs: https://www.alibabacloud.com/help/en/model-studio/stream
- Alibaba Cloud Qwen TTS docs: https://www.alibabacloud.com/help/en/model-studio/qwen-tts
