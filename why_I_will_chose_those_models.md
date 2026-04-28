# Why I Chose These Models

This note explains which models and service region I recommend for our AI products serving the US market and why.

The target workloads are:

- Translation tools
- Chatbots
- Command invoking and agent-style workflows
- Future voice input and voice output

Our application will serve the United States market, but the model endpoint does not have to be in the US if another region delivers better latency and broader model coverage. To make the benchmark closer to the real production path, I ran the tests from a US-based Vast.ai server and used Promptfoo to collect comparable metrics.

## Decision Summary

My recommendation is:

- Model service region: Alibaba Cloud DashScope Singapore
- Primary interactive model: Qwen3.5-Omni-Plus
- Speech output: Qwen3-TTS
- Speech input: Qwen3-ASR

This is the best current choice for our project because it balances four things at the same time:

- Good interactive latency
- Better TTFT than the tested US DashScope endpoint
- Better output control than the Qwen3.5-Flash text model in this benchmark
- A clear multimodal roadmap for chatbot and command workflows
- Lower integration complexity by staying inside one vendor family for text, speech synthesis, and speech recognition

The key point is that I am not recommending the US DashScope endpoint. I am recommending the Singapore DashScope endpoint, even for a US-facing product, because the measured TTFT was better and the Singapore endpoint has broader model support.

Qwen3.5-Omni-Flash is also very interesting as a latency-first fallback, but I would not make it the default production model unless speed is more important than capability headroom.

## Model Price

Price matters, but it should not be evaluated only as text-token price.

For this project, total cost includes:

- Model usage cost
- Speech recognition cost
- Speech synthesis cost
- Engineering cost for integrating multiple vendors
- Testing and observability cost across multiple APIs
- Operational complexity when different capabilities come from different platforms

Because of that, a unified Qwen stack can be cheaper in practice than a mixed-vendor stack, even if another single text model looks competitive on paper.

I am intentionally not hard-coding vendor price numbers in this memo because prices and contract tiers change frequently. Before procurement, we should confirm the latest official pricing on the vendor side. The architectural conclusion does not change: for this project, one integrated multimodal stack is more valuable than optimizing only for the lowest text-token price.

## Model Modalities

Our product roadmap is not text-only. We need a path for:

- Text generation
- Translation
- Chat-style interaction
- Tool use and command execution
- Speech-to-text
- Text-to-speech
- Future multimodal interaction

This is the main reason I prefer the Qwen family for the first production rollout.

It is also why I prefer the Singapore DashScope endpoint over the US DashScope endpoint: the Singapore side supports the Omni family, ASR, and TTS, while the US side does not currently provide the same model coverage.

Recommended capability split:

| Capability                                  | Recommended model  |
| ------------------------------------------- | ------------------ |
| Main chatbot, translation, command invoking | Qwen3.5-Omni-Plus  |
| Low-latency fallback tier                   | Qwen3.5-Omni-Flash |
| Speech recognition                          | Qwen3-ASR          |
| Speech synthesis                            | Qwen3-TTS          |

This gives us one coherent stack instead of one vendor for text, one vendor for ASR, and another vendor for TTS.

## Model Performance

### How I Read These Metrics

The benchmark collected four values:

- Average total latency
- Average TTFT, which is time to first token
- Average tokens per second
- Average completion tokens

For interactive products, TTFT is the most important number because it decides how fast the user feels the system starts responding.

Total latency is still useful, but it is affected by output length. A model that generates many more tokens can look slower even when its streaming speed is acceptable.

Tokens per second can also look artificially high on very short answers, so I use that metric mainly as a secondary signal and give more weight to TTFT and total latency.

One more important caveat: in this benchmark, non-Omni Qwen3.5-Flash was tested with thinking enabled. That means completion-token numbers can include reasoning tokens, not only visible answer text. So TTFT and total latency are more reliable than raw completion-token counts when comparing Qwen3.5-Flash against Omni models.

### Prompt 1: Short Response / TTFT-Oriented

Prompt:

> Write one plain sentence about a topic, between 18 and 28 words.

| Provider                          | Avg total latency |  Avg TTFT | Avg tokens/sec | Avg completion tokens |
| --------------------------------- | ----------------: | --------: | -------------: | --------------------: |
| qwen3.5-flash singapore           |          31694 ms |   1468 ms |          150.2 |                  4516 |
| qwen3.5-omni-flash singapore      |           1088 ms |   1045 ms |        11617.6 |                  21.5 |
| qwen3.5-omni-plus singapore       |         1746.5 ms | 1243.5 ms |           48.7 |                  24.5 |
| qwen3.5-flash united-states       |        27462.5 ms |   3664 ms |          156.3 |                  3730 |
| gemini-3-flash-preview openrouter |           4245 ms | 4094.5 ms |         2209.0 |                  25.5 |
| qwen3.5 xgd local                 |         1015.5 ms |  669.5 ms |           76.7 |                    26 |

### Prompt 2: Longer Response / Token-Speed-Oriented

Prompt:

> Write 8 bullet points about a topic, each bullet between 18 and 25 words.

| Provider                          | Avg total latency |  Avg TTFT | Avg tokens/sec | Avg completion tokens |
| --------------------------------- | ----------------: | --------: | -------------: | --------------------: |
| qwen3.5-flash singapore           |       108626.5 ms |   1061 ms |          129.0 |               12049.5 |
| qwen3.5-omni-flash singapore      |           2066 ms |   1045 ms |          190.1 |                   187 |
| qwen3.5-omni-plus singapore       |         4856.5 ms | 1252.5 ms |           51.9 |                   185 |
| qwen3.5-flash united-states       |          55863 ms |   3510 ms |          149.1 |                  7823 |
| gemini-3-flash-preview openrouter |           5693 ms | 4246.5 ms |          159.3 |                   210 |
| qwen3.5 xgd local                 |         2645.5 ms |  716.5 ms |           99.2 |                 191.5 |

### Key Observations

1. Qwen3.5-Omni-Flash had the fastest managed-cloud TTFT in this run.
2. Qwen3.5-Omni-Plus stayed close on TTFT while looking much more suitable as a stable default production tier.
3. Qwen3.5-Flash showed acceptable throughput, but its end-to-end latency and completion-token counts were much larger in this benchmark.
4. The US Qwen3.5-Flash endpoint was slower than the Singapore Qwen3.5-Flash endpoint even though the benchmark itself ran from a US server. This means region selection should be measured, not assumed.
5. Singapore is also the only practical Ali endpoint for this project today because it has the model coverage we need: Omni, ASR, and TTS.
6. Gemini through OpenRouter was a useful external baseline, but its TTFT in this run was too slow for our main interactive use case.
7. The local XGD deployment was very fast, but I treat it as an engineering baseline rather than the production decision because it represents a different deployment model from our target managed production path.

### Practical Interpretation

If I optimize only for raw first response speed, Qwen3.5-Omni-Flash looks very strong.

If I optimize for the overall product we actually want to build, Qwen3.5-Omni-Plus is the better default choice. It keeps TTFT in a good range, produces controlled output lengths, fits the multimodal roadmap, and avoids the large reasoning-heavy behavior we saw from Qwen3.5-Flash.

That is why I recommend DashScope Singapore plus Omni-Plus as the main production path, and keep Omni-Flash as an optional fast tier.

## Model Test Platform

### Promptfoo + Vast.ai

I am located in China, but our product serves the United States market. If I only test from my local network, the latency numbers will include too much local cross-border noise and will not reflect the real production path.

To reduce that distortion, I used:

- Promptfoo for repeatable multi-provider benchmarking
- A Vast.ai server in the United States to make the network path closer to our production environment

This setup is not perfect, but it is much more production-like than testing only from my own machine.

It also helped answer the most important deployment question in this memo: even from a US-based runner, the Singapore DashScope endpoint performed better than the tested US DashScope endpoint, so Singapore is the better service choice for now.

### Benchmark Design

The benchmark used two simple prompts:

- A short-response prompt to expose TTFT behavior
- A longer-response prompt to expose streaming speed and output-length behavior

This does not fully measure translation quality, tool-calling accuracy, or speech quality. What it does measure well is platform responsiveness and behavior under comparable prompt shapes.

For the next round, we should add business-specific prompts for:

- Real translation samples
- Customer-service chat turns
- Tool-calling and command invocation
- Speech input and speech output evaluation

## Why I Am Not Choosing GLM, DeepSeek, Kimi, GPT, or Gemini Platform as the Main Stack

This is not because those models are bad. Some of them are very strong.

I am not choosing them as the main production stack for this project right now because the decision criteria here are practical, not academic:

- I want one model family that can support text, multimodal interaction, speech input, and speech output together.
- I want a benchmark result that is already close to our target deployment path.
- I want the production stack to match the API pattern and evaluation path we have already validated with Promptfoo.
- I want to reduce vendor fragmentation in engineering, billing, monitoring, and security review.
- I want a production choice that fits chatbot, translation, and command workflows without building a more complicated multi-vendor architecture first.

Gemini was still useful as a benchmark baseline, and I would continue to keep a top external model in the comparison set. But based on this run, it is not the best first production choice for our current response-time target.

For GLM, DeepSeek, and Kimi, I do not see enough advantage in this project to justify widening the vendor matrix for the first release. I would rather standardize the first release on a Qwen-based stack and expand later only if a second vendor gives a clear business benefit.

## Why I Am Not Choosing the US DashScope Endpoint

I also do not recommend the US DashScope endpoint as the main service region right now.

The reason is simple:

- In this benchmark, the Singapore DashScope endpoint had better TTFT than the US DashScope endpoint.
- The Singapore DashScope endpoint supports the Qwen Omni family, ASR, and TTS.
- The US DashScope endpoint does not currently provide the same model coverage, so it cannot support the full stack we want.

For this project, broader model coverage matters more than keeping every component in the same geography. Since the application can still run in the US while calling the Singapore endpoint, the practical choice is to use Singapore until the US endpoint catches up in capability and performance.

## Result

My final recommendation is:

- Use Alibaba Cloud DashScope Singapore as the model service endpoint
- Qwen3.5-Omni-Plus for the main product model
- Qwen3-TTS for speech synthesis
- Qwen3-ASR for speech recognition

Optional note for implementation:

- Keep Qwen3.5-Omni-Flash as a backup candidate for latency-sensitive scenarios
- Do not use the current US DashScope endpoint as the main service path until it offers comparable TTFT and the same Omni, ASR, and TTS coverage
- Do not use Qwen3.5-Flash as the default interactive tier until we are comfortable with its reasoning cost and latency behavior in our real business prompts

In short, the best current choice is a US-facing application that calls the Alibaba Cloud Singapore endpoint, using Qwen Omni plus Qwen TTS and Qwen ASR as one integrated stack.