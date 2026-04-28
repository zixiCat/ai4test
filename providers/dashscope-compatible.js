const OpenAI = require('openai');

const DEFAULT_MAX_TOKENS = 512;

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function extractText(content) {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }

        if (typeof part?.text === 'string') {
          return part.text;
        }

        if (typeof part?.content === 'string') {
          return part.content;
        }

        return '';
      })
      .join('');
  }

  if (typeof content?.text === 'string') {
    return content.text;
  }

  return '';
}

function normalizeUsage(usage) {
  if (!usage || typeof usage !== 'object') {
    return undefined;
  }

  const prompt = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0) || 0;
  const completion = Number(usage.completion_tokens ?? usage.output_tokens ?? 0) || 0;
  const total = Number(usage.total_tokens ?? prompt + completion) || prompt + completion;
  const normalized = {};

  if (prompt) {
    normalized.prompt = prompt;
  }

  if (completion) {
    normalized.completion = completion;
  }

  if (total) {
    normalized.total = total;
  }

  return Object.keys(normalized).length ? normalized : undefined;
}

function estimateCompletionTokens(output) {
  if (!output) {
    return 0;
  }

  return Math.max(1, Math.round(output.length / 4));
}

function parseErrorBody(body) {
  try {
    const parsed = JSON.parse(body);
    return parsed?.error?.message || parsed?.message || body;
  } catch {
    return body;
  }
}

async function readChatCompletionStream(stream) {
  let output = '';
  let firstTokenAt;
  let tokenUsage;
  let textChunkCount = 0;
  for await (const chunk of stream) {
    const usage = normalizeUsage(chunk.usage);
    if (usage) {
      tokenUsage = usage;
    }

    const choice = chunk.choices?.[0];
    const streamedReasoning = extractText(choice?.delta?.reasoning_content ?? chunk.reasoning_content);
    const text = extractText(choice?.delta?.content ?? choice?.message?.content ?? choice?.text);

    if (!firstTokenAt) {
      firstTokenAt = Date.now();
    }

    if (!text) {
      continue;
    }

    textChunkCount++;
    output += text;
  }

  // Tokens/sec is only meaningful when the endpoint truly streams (multiple chunks).
  // A single-chunk response means firstTokenAt ≈ finishedAt, which would produce
  // an absurdly large tokens/sec value.
  const isStreaming = textChunkCount > 1;
  return { output, firstTokenAt, tokenUsage, isStreaming };
}

module.exports = class DashScopeCompatibleProvider {
  constructor(options = {}) {
    this.providerId = options.id || 'dashscope-compatible';
    this.config = options.config || {};
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt) {
    const apiKey =
      this.config.apiKey ||
      (this.config.apiKeyEnvar ? process.env[this.config.apiKeyEnvar] : undefined) ||
      process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return {
        error: `Missing API key for ${this.providerId}. Set ${this.config.apiKeyEnvar || 'OPENAI_API_KEY'}.`,
      };
    }

    const apiBaseUrl = stripTrailingSlash(
      this.config.apiBaseUrl || process.env.OPENAI_API_BASE_URL || process.env.OPENAI_BASE_URL || '',
    );

    if (!apiBaseUrl) {
      return {
        error: `Missing apiBaseUrl for ${this.providerId}.`,
      };
    }

    if (!this.config.model) {
      return {
        error: `Missing model for ${this.providerId}.`,
      };
    }

    const requestBody = {
      model: this.config.model,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      max_tokens: this.config.max_tokens ?? DEFAULT_MAX_TOKENS,
      stream_options: { include_usage: true },
      enable_thinking: true,
    };

    if (typeof this.config.temperature === 'number') {
      requestBody.temperature = this.config.temperature;
    }

    if (this.config.passthrough && typeof this.config.passthrough === 'object') {
      Object.assign(requestBody, this.config.passthrough);
    }

    const client = new OpenAI({
      apiKey,
      baseURL: apiBaseUrl,
      defaultHeaders: this.config.headers || {},
    });

    const startedAt = Date.now();

    let output = '';
    let firstTokenAt;
    let tokenUsage;
    let isStreaming = false;

    try {
      const stream = await client.chat.completions.create(requestBody);
      ({ output, firstTokenAt, tokenUsage, isStreaming } = await readChatCompletionStream(stream));
    } catch (error) {
      if (typeof error?.status === 'number') {
        return {
          error: `Request failed with ${error.status}${error.statusText ? ` ${error.statusText}` : ''}: ${parseErrorBody(error.message)}`,
        };
      }

      return {
        error: `Request failed for ${this.providerId}: ${error.message}`,
      };
    }

    const finishedAt = Date.now();
    const totalLatencyMs = finishedAt - startedAt;
    const completionTokenCount = tokenUsage?.completion ?? estimateCompletionTokens(output);
    const generationDurationSeconds = firstTokenAt
      ? Math.max((finishedAt - firstTokenAt) / 1000, 0.001)
      : Math.max(totalLatencyMs / 1000, 0.001);
    // Only report tokens/sec when we confirmed the endpoint is truly streaming.
    // A non-streaming single-chunk response gives generationDuration ≈ 0,
    // which would produce a meaninglessly large value.
    const outputTokensPerSecond = isStreaming
      ? completionTokenCount / generationDurationSeconds
      : undefined;

    return {
      output,
      tokenUsage,
      metadata: {
        apiBaseUrl,
        region: this.config.region,
        model: this.config.model,
        totalLatencyMs,
        ttftMs: firstTokenAt ? firstTokenAt - startedAt : undefined,
        completionTokenCount,
        completionTokenCountSource: tokenUsage?.completion ? 'usage' : 'estimated_from_characters',
        outputTokensPerSecond,
      },
    };
  }
};