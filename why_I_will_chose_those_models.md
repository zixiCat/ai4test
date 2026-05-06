# Why I Chose These Models

This note explains which models and service region I recommend for our AI products serving the US market and why.

The target workloads are:

- Translation tools
- Chatbots
- Command invoking and agent-style workflows
- Future voice input and voice output

Our application will serve the United States market, but the model endpoint does not have to be in the US if another region delivers better latency and broader model coverage. To make the benchmark closer to the real production path, I used Promptfoo and collected multiple cached result sets under `output/bg`, `output/uk`, `output/use`, and `output/usw`.

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

The key point is that I am not recommending the US DashScope endpoint. I am recommending the Singapore DashScope endpoint, even for a US-facing product, because the measured TTFT was consistently better and the Singapore endpoint has broader model support.

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

This memo now includes all twelve cached summary files in the `output` folder:

- `output/bg/text.txt`, `output/bg/asr.txt`, `output/bg/tts.txt`
- `output/uk/text.txt`, `output/uk/asr.txt`, `output/uk/tts.txt`
- `output/use/text.txt`, `output/use/asr.txt`, `output/use/tts.txt`
- `output/usw/text.txt`, `output/usw/asr.txt`, `output/usw/tts.txt`

I keep the folder IDs exactly as they appear in the repo because the workspace does not document what each short name expands to.

The benchmark collected these values:

- Average total latency
- Average TTFT, which is time to first token
- Average tokens per second
- Average completion tokens
- For TTS, average audio bytes per second, average audio bytes, and average input characters

For interactive products, TTFT is the most important number because it decides how fast the user feels the system starts responding. Total latency still matters, but it is affected by output length. Tokens per second is a secondary signal here, especially for short outputs where the value can spike unrealistically.

## How To Reproduce

If you want numbers that are comparable to this memo, run the benchmark from a US-based server rather than from a local China network. The goal is to keep the network path closer to the real US production path.

1. Prepare a US-based Linux runner, for example a Vast.ai instance in the United States.
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

### Cross-Run Summary

The recommendation survives all four cached text runs.

| Provider                          | Short TTFT avg | Long TTFT avg | Long total latency avg | Long completion tokens | Read                                                                    |
| --------------------------------- | -------------: | ------------: | ---------------------: | ---------------------: | ----------------------------------------------------------------------- |
| qwen3.5-omni-flash singapore      |      1154.3 ms |     1150.0 ms |              2114.8 ms |             173 to 182 | Best managed-cloud latency tier                                         |
| qwen3.5-omni-plus singapore       |      1627.3 ms |     1627.3 ms |              4902.6 ms |           186.3 to 197 | Best default production tier                                            |
| qwen3.5-flash singapore           |      1191.0 ms |     1230.9 ms |             46151.5 ms |           6132 to 7293 | TTFT looks fine, but output length and end-to-end latency are too large |
| qwen3.5-flash united-states       |      3495.3 ms |     3372.2 ms |             55534.5 ms |           6302 to 7156 | Worse TTFT than Singapore and weaker model coverage                     |
| gemini-3-flash-preview openrouter |      1674.1 ms |     1785.6 ms |              3255.2 ms |                  209.7 | Useful text baseline, but not a unified stack for this roadmap          |
| qwen3.5 xgd local                 |       657.1 ms |      790.0 ms |              2520.2 ms |         183.3 to 189.3 | Useful engineering baseline, but a different deployment model           |

### What Matters Most

1. Qwen3.5-Omni-Flash had the best managed-cloud TTFT across the four output snapshots, so it is the strongest latency-first fallback.
2. Qwen3.5-Omni-Plus stayed close enough on TTFT while keeping completion length controlled, which makes it the better default production tier.
3. Qwen3.5-Flash in Singapore did not fail on TTFT, but it produced very large completion-token counts in every run. That is the main reason its total latency became unacceptable for an interactive default.
4. The tested US DashScope flash endpoint was slower than the Singapore flash endpoint in all four cached runs. Region choice should therefore be measured, not assumed.
5. Gemini remained a useful external text baseline, but the decision here is about the full production stack, not only standalone text speed.
6. The local XGD deployment stayed fast, but I treat it as an engineering reference rather than the production choice because it is a different operating model.

## Speech Benchmark Results

### Cross-Run Summary

The speech results vary by output folder, but the pattern is still good enough for the current recommendation.

| Capability | Provider                  |       TTFT range | Total latency range | Throughput read          |
| ---------- | ------------------------- | ---------------: | ------------------: | ------------------------ |
| ASR        | qwen3-asr-flash singapore | 677 to 1850.3 ms |   1139 to 2536.3 ms | 82.9 to 224.9 tok/s      |
| TTS        | qwen3-tts-flash singapore | 553.7 to 1653 ms |   2503 to 3418.7 ms | 202368.8 to 303431.8 B/s |

These runs are still mainly latency and responsiveness checks. They are not yet a broad quality study across accents, noise, domain-specific audio, or listening-quality evaluation for naturalness and pronunciation.

### Detailed ASR Results By Output Folder

Each cell below is `TTFT ms / total latency ms / tokens per second / completion tokens`.

| Provider                  | bg                           | uk                         | use                        | usw                      |
| ------------------------- | ---------------------------- | -------------------------- | -------------------------- | ------------------------ |
| qwen3-asr-flash singapore | 1850.3 / 1908.7 / 210.1 / 12 | 1028.3 / 1139 / 161.2 / 12 | 1847 / 1900.7 / 224.9 / 12 | 677 / 2536.3 / 82.9 / 12 |

### Detailed TTS Results By Output Folder

Each cell below is `TTFT ms / total latency ms / audio bytes per second / audio bytes / input characters`.

| Provider                  | bg                                       | uk                                     | use                                        | usw                                       |
| ------------------------- | ---------------------------------------- | -------------------------------------- | ------------------------------------------ | ----------------------------------------- |
| qwen3-tts-flash singapore | 1653 / 3418.7 / 261094.3 / 483884 / 82.3 | 1009 / 2503 / 303431.8 / 445484 / 82.3 | 1551.3 / 3170.7 / 284909.8 / 472364 / 82.3 | 553.7 / 2868.7 / 202368.8 / 430124 / 82.3 |

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

In short, the best current choice is a US-facing application that calls the Alibaba Cloud Singapore endpoint, using Qwen Omni plus Qwen TTS and Qwen ASR as one integrated stack.