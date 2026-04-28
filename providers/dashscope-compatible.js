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

function extractResponseText(data) {
  return extractText(
    data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text ?? data.output_text ?? data.output,
  );
}

async function readEventStream(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let rawText = '';
  let buffer = '';
  let output = '';
  let firstTokenAt;
  let tokenUsage;
  let sawEventStream = false;

  const applyPayload = (parsed) => {
    const usage = normalizeUsage(parsed.usage);
    if (usage) {
      tokenUsage = usage;
    }

    const choice = parsed.choices?.[0];
    const streamedReasoning = extractText(choice?.delta?.reasoning_content ?? parsed.reasoning_content);
    const text = extractText(
      choice?.delta?.content ??
        choice?.message?.content ??
        choice?.text ??
        parsed.output_text ??
        parsed.output,
    );

    if (!firstTokenAt && (text || streamedReasoning)) {
      firstTokenAt = Date.now();
    }

    if (!text) {
      return;
    }

    output += text;
  };

  const processEvent = (rawEvent) => {
    const dataLines = [];

    for (const line of rawEvent.split('\n')) {
      if (!line.startsWith('data:')) {
        continue;
      }

      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') {
        continue;
      }

      sawEventStream = true;
      dataLines.push(data);
    }

    if (!dataLines.length) {
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(dataLines.join('\n'));
    } catch {
      return;
    }

    applyPayload(parsed);
  };

  while (true) {
    const { done, value } = await reader.read();
    const chunk = done ? decoder.decode() : decoder.decode(value, { stream: true });

    rawText += chunk;
    buffer += chunk.replace(/\r\n/g, '\n');

    let delimiterIndex = buffer.indexOf('\n\n');
    while (delimiterIndex !== -1) {
      const rawEvent = buffer.slice(0, delimiterIndex);
      buffer = buffer.slice(delimiterIndex + 2);
      processEvent(rawEvent);
      delimiterIndex = buffer.indexOf('\n\n');
    }

    if (done) {
      if (buffer.trim()) {
        processEvent(buffer);
      }
      break;
    }
  }

  return { output, firstTokenAt, tokenUsage, rawText, sawEventStream };
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
    };

    if (typeof this.config.temperature === 'number') {
      requestBody.temperature = this.config.temperature;
    }

    if (this.config.passthrough && typeof this.config.passthrough === 'object') {
      Object.assign(requestBody, this.config.passthrough);
    }

    const startedAt = Date.now();

    let response;
    try {
      response = await fetch(`${apiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          ...(this.config.headers || {}),
        },
        body: JSON.stringify(requestBody),
      });
    } catch (error) {
      return {
        error: `Request failed for ${this.providerId}: ${error.message}`,
      };
    }

    if (!response.ok) {
      const body = await response.text();
      return {
        error: `Request failed with ${response.status} ${response.statusText}: ${parseErrorBody(body)}`,
      };
    }

    let output = '';
    let firstTokenAt;
    let tokenUsage;

    try {
      if (response.body) {
        const streamed = await readEventStream(response);

        if (streamed.sawEventStream) {
          ({ output, firstTokenAt, tokenUsage } = streamed);
        } else {
          const data = JSON.parse(streamed.rawText);
          output = extractResponseText(data);
          tokenUsage = normalizeUsage(data.usage);
        }
      } else {
        const data = await response.json();
        output = extractResponseText(data);
        tokenUsage = normalizeUsage(data.usage);
      }
    } catch (error) {
      return {
        error: `Failed to parse response from ${this.providerId}: ${error.message}`,
      };
    }

    const finishedAt = Date.now();
    const totalLatencyMs = finishedAt - startedAt;
    const completionTokenCount = tokenUsage?.completion ?? estimateCompletionTokens(output);
    const generationDurationSeconds = firstTokenAt
      ? Math.max((finishedAt - firstTokenAt) / 1000, 0.001)
      : Math.max(totalLatencyMs / 1000, 0.001);
    const outputTokensPerSecond = completionTokenCount / generationDurationSeconds;

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