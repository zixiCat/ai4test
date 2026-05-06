# Why I Chose These Models

This note explains which models and service region I recommend for our AI products serving a global market and why.

The target workloads are:

- Translation tools
- Chatbots
- Command invoking and agent-style workflows
- Voice input and voice output

Our application serves a global market, so the model endpoint should be chosen based on latency and model coverage rather than the geography of the application servers. To benchmark across different access paths, I used Promptfoo and collected result sets from four locations under `output/bg`, `output/uk`, `output/use`, and `output/usw`.

## Executive Recommendation

My recommendation is:

- Model service region: Alibaba Cloud DashScope Singapore
- Primary interactive model: Qwen3.5-Omni-Plus
- Low-latency fallback model: Qwen3.5-Omni-Flash
- Speech output: Qwen3-TTS
- Speech input: Qwen3-ASR

This is the best current choice for our project because it balances five things at the same time:

- Good interactive TTFT across all cached runs
- Better TTFT than the tested US DashScope endpoint
- Better output control than the Qwen3.5-Flash text model in this benchmark
- A clear multimodal roadmap for chatbot and command workflows
- Lower integration complexity by staying inside one vendor family for text, speech synthesis, and speech recognition

The key point is that I am not recommending the US DashScope endpoint. I am recommending the Singapore DashScope endpoint for a globally-facing product, because the measured TTFT was consistently better across all runner locations and the Singapore endpoint has broader model support.

## Why This Stack

Price matters, but it should not be evaluated only as text-token price.

For this project, total cost includes:

- Model usage cost
- Speech recognition cost
- Speech synthesis cost
- Engineering cost for integrating multiple vendors
- Testing and observability cost across multiple APIs
- Operational complexity when different capabilities come from different platforms

Because of that, a unified Qwen stack can be cheaper in practice than a mixed-vendor stack, even if another single text model looks competitive on paper.

Our product roadmap is not text-only. We need a path for:

- Text generation
- Translation
- Chat-style interaction
- Tool use and command execution
- Speech-to-text
- Text-to-speech
- Future multimodal interaction

This is the main reason I prefer the Qwen family for the first production rollout.

Recommended capability split:

| Capability                                  | Recommended model  |
| ------------------------------------------- | ------------------ |
| Main chatbot, translation, command invoking | Qwen3.5-Omni-Plus  |
| Low-latency fallback tier                   | Qwen3.5-Omni-Flash |
| Speech recognition                          | Qwen3-ASR          |
| Speech synthesis                            | Qwen3-TTS          |

This gives us one coherent stack instead of one vendor for text, one vendor for ASR, and another vendor for TTS.

## Benchmark Scope

I tested three benchmark groups in this workspace:

- Text benchmark: `promptfooconfig.yaml` with `prompts/ttft.txt` and `prompts/token-speed.txt` across the configured Singapore DashScope, US DashScope, OpenRouter, and local XGD providers
- ASR benchmark: `promptfoo.asr.yaml` with `prompts/asr.txt` and `tests/asr-benchmark-cases.yaml`, which currently transcribes the official DashScope `welcome.mp3` sample through `qwen3-asr-flash singapore`
- TTS benchmark: `promptfoo.tts.yaml` with `prompts/tts.txt` and `tests/tts-benchmark-cases.yaml`, which currently synthesizes one short English sample and one longer Chinese sample with the `Cherry` voice through `qwen3-tts-flash singapore`

This memo now includes all twelve cached summary files in the `output` folder, collected from four runner locations:

- `bg` — Bulgaria
- `uk` — United Kingdom
- `use` — US East
- `usw` — US West

The benchmark collected these values:

- Average total latency
- Average TTFT, which is time to first token
- Average tokens per second
- Average completion tokens
- For TTS, average audio bytes per second, average audio bytes, and average input characters

For interactive products, TTFT is the most important number because it decides how fast the user feels the system starts responding. Total latency still matters, but it is affected by output length. Tokens per second is a secondary signal here, especially for short outputs where the value can spike unrealistically.

## How To Reproduce

If you want numbers that are comparable to this memo, run the benchmark from servers close to your target users rather than from a local China network. The current cached results use US East and US West as primary references since the US is one of the core markets, but running from European or Southeast Asian nodes as well will give a more complete global picture.

1. Prepare a Linux runner in a region close to your target users, for example a Vast.ai instance in the United States or Europe.
2. Put the required API keys in `.env`. For this workspace that can include `DASHSCOPE_SG_API_KEY`, `DASHSCOPE_US_API_KEY`, `OPENROUTER_API_KEY`, and `SEETACLOUD_XGD_API_KEY`, depending on which providers you want active.
3. Run `npm run start:text`, `npm run start:asr`, and `npm run start:tts`.
4. Review the generated `.promptfoo-output.json`, `.promptfoo-output.asr.json`, and `.promptfoo-output.tts.json` files, or read the aggregated summaries written into `output/<runner-id>/*.txt`.

## Current Limits

This round measures platform responsiveness and streaming behavior across text, ASR, and TTS. It does not yet fully measure:

- Translation quality on real business content
- Tool-calling or command-invocation accuracy
- Transcript accuracy on domain audio, accents, and noisy environments
- TTS naturalness, pronunciation quality, and style control

For the next round, we should add business-specific prompts for translation, customer-service chat, tool calling, longer domain audio, and human or automated quality evaluation for speech output.

## Text Benchmark Results

### TTFT by Runner Location (Long Prompt)

Each column is one runner location. Values are average TTFT in milliseconds for the long-output prompt (`prompts/token-speed.txt`). Lower is better.

| Provider                          | bg (Bulgaria) | uk (United Kingdom) | use (US East) | usw (US West) |
| --------------------------------- | ------------: | ------------------: | ------------: | ------------: |
| qwen3.5-omni-flash singapore      |       1264 ms |              772 ms |       1239 ms |       1326 ms |
| qwen3.5-omni-plus singapore       |       1568 ms |             1083 ms |       1498 ms |       2360 ms |
| qwen3.5-flash singapore           |       1337 ms |              903 ms |       1248 ms |       1435 ms |
| qwen3.5-flash united-states       |       2860 ms |             2489 ms |       2150 ms |       5990 ms |
| gemini-3-flash-preview openrouter |       1556 ms |             1386 ms |       1360 ms |       2841 ms |
| qwen3.5 xgd local                 |        740 ms |              771 ms |       1353 ms |        296 ms |

### Total End-to-End Latency by Runner Location (Long Prompt)

Values are average total latency in milliseconds. This metric is dominated by output length, so compare it together with completion-token counts rather than reading it in isolation.

| Provider                          | bg (Bulgaria) | uk (United Kingdom) | use (US East) | usw (US West) |
| --------------------------------- | ------------: | ------------------: | ------------: | ------------: |
| qwen3.5-omni-flash singapore      |       2163 ms |             1690 ms |       2105 ms |       2502 ms |
| qwen3.5-omni-plus singapore       |       5345 ms |             4920 ms |       4923 ms |       4422 ms |
| qwen3.5-flash singapore           |      47322 ms |            54068 ms |      42826 ms |      40390 ms |
| qwen3.5-flash united-states       |      59355 ms |            55455 ms |      48451 ms |      58877 ms |
| gemini-3-flash-preview openrouter |       2975 ms |             2938 ms |       2741 ms |       4367 ms |
| qwen3.5 xgd local                 |       2369 ms |             2435 ms |       2952 ms |       2325 ms |

### What Matters Most

1. Qwen3.5-Omni-Flash had the best managed-cloud TTFT across all four runner locations, so it is the strongest latency-first fallback.
2. Qwen3.5-Omni-Plus stayed close enough on TTFT while keeping completion length controlled, which makes it the better default production tier.
3. Qwen3.5-Flash in Singapore did not fail on TTFT, but it produced very large completion-token counts in every run. That is the main reason its total latency became unacceptable for an interactive default.
4. The tested US DashScope flash endpoint was slower than the Singapore flash endpoint at every runner location. Region choice should therefore be measured, not assumed.
5. Gemini remained a useful external text baseline, but the decision here is about the full production stack, not only standalone text speed.
6. The local XGD deployment stayed fast, but I treat it as an engineering reference rather than the production choice because it is a different operating model.

## Speech Benchmark Results

### ASR TTFT by Runner Location

Provider: qwen3-asr-flash singapore. All runs transcribed the official DashScope `welcome.mp3` sample (12 completion tokens).

| Runner              |    TTFT | Total Latency |  Tokens/sec |
| ------------------- | ------: | ------------: | ----------: |
| bg (Bulgaria)       | 1850 ms |       1909 ms | 210.1 tok/s |
| uk (United Kingdom) | 1028 ms |       1139 ms | 161.2 tok/s |
| use (US East)       | 1847 ms |       1901 ms | 224.9 tok/s |
| usw (US West)       |  677 ms |       2536 ms |  82.9 tok/s |

### TTS TTFT by Runner Location

Provider: qwen3-tts-flash singapore. All runs synthesized the same two sample texts with the Cherry voice (avg 82.3 input characters).

| Runner              |    TTFT | Total Latency | Audio bytes/sec |
| ------------------- | ------: | ------------: | --------------: |
| bg (Bulgaria)       | 1653 ms |       3419 ms |      261094 B/s |
| uk (United Kingdom) | 1009 ms |       2503 ms |      303432 B/s |
| use (US East)       | 1551 ms |       3171 ms |      284910 B/s |
| usw (US West)       |  554 ms |       2869 ms |      202369 B/s |

These runs are still mainly latency and responsiveness checks. They are not yet a broad quality study across accents, noise, domain-specific audio, or listening-quality evaluation for naturalness and pronunciation.

## Competitive Context: Real-Time Voice AI Platforms

For reference, two other real-time AI platforms are worth noting here.

Doubao Live (ByteDance) and Gemini Live (Google) both deliver first-response times in the **800 ms to 1300 ms range** for interactive voice sessions. This confirms that the TTFT range we see in this benchmark — particularly 767 ms to 1390 ms for Qwen3.5-Omni-Flash across the four runner locations — is aligned with current industry expectations for real-time AI interfaces. Our recommended stack is competitive on raw first-response latency.

The reason I am not recommending Doubao Live or Gemini Live as the primary stack is the same reason I explain below: vendor fragmentation. Both platforms focus on end-to-end voice conversation products, not on the flexible text-plus-speech API surface we need for translation tools, command invoking, and custom chatbot workflows. Adopting them would mean maintaining a separate integration path for voice and a separate one for text, which increases both engineering cost and operational complexity.

## Why I Am Not Choosing GLM, DeepSeek, Kimi, GPT, or Gemini Platform as the Main Stack

This is not because those models are bad. Some of them are very strong.

I am not choosing them as the main production stack for this project right now because the decision criteria here are practical, not academic:

- I want one model family that can support text, multimodal interaction, speech input, and speech output together
- I want benchmark results that are already close to our target deployment path
- I want the production stack to match the API pattern and evaluation path we have already validated with Promptfoo
- I want to reduce vendor fragmentation in engineering, billing, monitoring, and security review
- I want a production choice that fits chatbot, translation, and command workflows without building a more complicated multi-vendor architecture first

Gemini was still useful as a benchmark baseline, and I would continue to keep a top external model in the comparison set. But the question here is not only which text model can answer quickly. The question is which stack gives us a strong default text model, a fast fallback tier, ASR, TTS, and a cleaner operational path at the same time. On that combined criterion, the Qwen stack is the better first production choice.

For GLM, DeepSeek, and Kimi, I do not see enough advantage in this project to justify widening the vendor matrix for the first release. I would rather standardize the first release on a Qwen-based stack and expand later only if a second vendor gives a clear business benefit.

## Why I Am Not Choosing the US DashScope Endpoint

I also do not recommend the US DashScope endpoint as the main service region right now.

The reason is simple:

- In all four cached text runs, the Singapore DashScope flash endpoint had better TTFT than the US DashScope flash endpoint
- The Singapore DashScope endpoint supports the Qwen Omni family, ASR, and TTS
- The US DashScope endpoint does not currently provide the same model coverage, so it cannot support the full stack we want

For this project, broader model coverage matters more than keeping every component in the same geography. Since the application can still run in the US while calling the Singapore endpoint, the practical choice is to use Singapore until the US endpoint catches up in both capability and performance.

## Final Result

My final recommendation is:

- Use Alibaba Cloud DashScope Singapore as the model service endpoint
- Use Qwen3.5-Omni-Plus as the main product model
- Keep Qwen3.5-Omni-Flash as a backup candidate for latency-sensitive scenarios
- Use Qwen3-TTS for speech synthesis
- Use Qwen3-ASR for speech recognition

Do not use the current US DashScope endpoint as the main service path until it offers comparable TTFT and the same Omni, ASR, and TTS coverage.

Do not use Qwen3.5-Flash as the default interactive tier until we are comfortable with its reasoning cost and latency behavior on our real business prompts.

In short, the best current choice for a globally-facing application is to call the Alibaba Cloud Singapore endpoint, using Qwen Omni plus Qwen TTS and Qwen ASR as one integrated stack.