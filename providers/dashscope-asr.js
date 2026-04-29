const OpenAI = require('openai');

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return undefined;
}

function mergeProviderConfig(baseConfig, promptConfig) {
  if (!promptConfig || typeof promptConfig !== 'object') {
    return baseConfig;
  }

  return {
    ...baseConfig,
    ...promptConfig,
    headers: {
      ...(baseConfig.headers || {}),
      ...(promptConfig.headers || {}),
    },
    extraBody: {
      ...(baseConfig.extraBody || {}),
      ...(promptConfig.extraBody || {}),
    },
    asrOptions: {
      ...(baseConfig.asrOptions || {}),
      ...(promptConfig.asrOptions || {}),
    },
  };
}

function getContextVars(context) {
  return context?.vars || context?.test?.vars || {};
}

function stripTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
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

function buildAsrRequest(vars, config) {
  const audioData = firstDefined(
    vars.audio_data,
    vars.audioData,
    vars.audio_url,
    vars.audioUrl,
    config.audioData,
    config.audioUrl,
  );

  if (!audioData) {
    throw new Error(`Missing audio input for ${config.model}. Set audio_url or audio_data in the test vars.`);
  }

  const content = [{
    type: 'input_audio',
    input_audio: {
      data: audioData,
    },
  }];

  const instruction = firstDefined(vars.asr_instruction, vars.asrInstruction, config.asrInstruction);
  if (instruction && String(instruction).trim()) {
    content.push({
      type: 'text',
      text: String(instruction).trim(),
    });
  }

  const requestBody = {
    model: config.model,
    messages: [{ role: 'user', content }],
    stream: config.stream !== false,
  };

  if (requestBody.stream) {
    requestBody.stream_options = { include_usage: true };
  }

  if (config.max_tokens !== undefined && config.max_tokens !== null) {
    requestBody.max_tokens = config.max_tokens;
  }

  const asrOptions = {
    ...(config.asrOptions || {}),
  };
  const language = firstDefined(vars.asr_language, vars.asrLanguage, vars.language, config.language);
  if (language !== undefined) {
    asrOptions.language = language;
  }

  const extraBody = { ...(config.extraBody || {}) };
  if (Object.keys(asrOptions).length > 0) {
    extraBody.asr_options = asrOptions;
  }
  if (Object.keys(extraBody).length > 0) {
    requestBody.extra_body = extraBody;
  }

  return requestBody;
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

    if (!firstTokenAt && (streamedReasoning || text)) {
      firstTokenAt = Date.now();
    }

    if (!text) {
      continue;
    }

    textChunkCount += 1;
    output += text;
  }

  return {
    output,
    firstTokenAt,
    tokenUsage,
    isStreaming: textChunkCount > 1,
  };
}

module.exports = class DashScopeAsrProvider {
  constructor(options = {}) {
    this.providerId = options.id || 'dashscope-asr';
    this.config = options.config || {};
  }

  id() {
    return this.providerId;
  }

  getMergedConfig(context) {
    return mergeProviderConfig(this.config, context?.prompt?.config || {});
  }

  getApiKey(config = this.config) {
    return (
      config.apiKey ||
      (config.apiKeyEnvar ? process.env[config.apiKeyEnvar] : undefined) ||
      process.env.OPENAI_API_KEY
    );
  }

  async callApi(_prompt, context = {}) {
    const config = this.getMergedConfig(context);
    const apiKey = this.getApiKey(config);

    if (!apiKey) {
      return {
        error: `Missing API key for ${this.providerId}. Set ${config.apiKeyEnvar || 'OPENAI_API_KEY'}.`,
      };
    }

    const apiBaseUrl = stripTrailingSlash(
      config.apiBaseUrl || process.env.OPENAI_API_BASE_URL || process.env.OPENAI_BASE_URL || '',
    );

    if (!apiBaseUrl) {
      return {
        error: `Missing apiBaseUrl for ${this.providerId}.`,
      };
    }

    if (!config.model) {
      return {
        error: `Missing model for ${this.providerId}.`,
      };
    }

    const client = new OpenAI({
      apiKey,
      baseURL: apiBaseUrl,
      defaultHeaders: config.headers || {},
    });

    const startedAt = Date.now();
    const vars = getContextVars(context);
    let output = '';
    let firstTokenAt;
    let tokenUsage;
    let isStreaming = false;

    try {
      const requestBody = buildAsrRequest(vars, config);
      const response = await client.chat.completions.create(requestBody);
      if (requestBody.stream) {
        ({ output, firstTokenAt, tokenUsage, isStreaming } = await readChatCompletionStream(response));
      } else {
        output = extractText(response.choices?.[0]?.message?.content);
        tokenUsage = normalizeUsage(response.usage);
      }
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
    const outputTokensPerSecond = isStreaming
      ? completionTokenCount / generationDurationSeconds
      : undefined;

    return {
      output,
      tokenUsage,
      metadata: {
        apiBaseUrl,
        region: config.region,
        model: config.model,
        requestType: 'asr',
        totalLatencyMs,
        ttftMs: firstTokenAt ? firstTokenAt - startedAt : undefined,
        completionTokenCount,
        completionTokenCountSource: tokenUsage?.completion ? 'usage' : 'estimated_from_characters',
        outputTokensPerSecond,
      },
    };
  }
};