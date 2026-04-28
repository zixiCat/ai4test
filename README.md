# Promptfoo OpenAI-compatible benchmark

This workspace compares two OpenAI-compatible DashScope endpoints for the same model.
The config is split across separate prompt, provider, and test files so it is easier to maintain.

## Quick start

1. Put API keys in `.env`.

```bash
DASHSCOPE_SG_API_KEY=sk-...
DASHSCOPE_US_API_KEY=sk-...
```

2. Adjust the model or base URLs in `providers/dashscope-sg.yaml` and `providers/dashscope-us.yaml`.

3. Validate the config.

```bash
npm run validate
```

4. Run the benchmark.

```bash
npm run eval
```

5. Open the web UI.

```bash
npm run view
```

## OpenAI-compatible provider usage

If you only need normal Promptfoo behavior, you can point the built-in OpenAI provider at a compatible endpoint like this:

```yaml
providers:
	- id: openai:chat:qwen3.5-flash
		label: dashscope-sg
		config:
			apiBaseUrl: https://dashscope-intl.aliyuncs.com/compatible-mode/v1
			apiKeyEnvar: DASHSCOPE_SG_API_KEY
			temperature: 0
			max_tokens: 512
```

That is enough for output, cost, and end-to-end latency.

This repo uses `providers/dashscope-compatible.js` instead, because Promptfoo's built-in OpenAI provider does not currently expose TTFT and output tokens per second as first-class metrics.

## File layout

- `promptfooconfig.yaml` wires the benchmark together.
- `prompts/` holds the short-response and long-response prompt variants.
- `providers/` contains one provider file per endpoint plus the shared JS provider.
- `tests/benchmark-cases.yaml` contains the topics to run.
- `tests/default-benchmark.yaml` and `tests/metrics.js` emit benchmark metrics through `namedScores`, which Promptfoo then uses for derived metrics.

## Metrics in this setup

- `avg_total_latency_ms`: average end-to-end latency measured by the custom provider.
- `avg_ttft_ms`: average time to first streamed token, including reasoning chunks when the model streams them before visible answer text.
- `avg_output_tokens_per_second`: average output throughput.
- `avg_completion_tokens`: average output token count used for throughput calculations.

The benchmark metrics are emitted as `namedScores` from a JavaScript assertion instead of using assertion-level `metric` with `weight: 0`, because Promptfoo 0.121.8 applies the assertion weight during metric aggregation.

When the endpoint does not return usage data in the stream, the provider falls back to a simple character-based token estimate for throughput so the comparison still works.

## Learn more

- Configuration guide: https://promptfoo.dev/docs/configuration/guide
- OpenAI provider docs: https://www.promptfoo.dev/docs/providers/openai/
- Assertions and metrics: https://promptfoo.dev/docs/configuration/expected-outputs/
- Custom JavaScript providers: https://www.promptfoo.dev/docs/providers/custom-api/
