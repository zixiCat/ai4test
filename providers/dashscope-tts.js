const TTS_SERVICE_PATH = '/services/aigc/multimodal-generation/generation';

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
    ttsParameters: {
      ...(baseConfig.ttsParameters || {}),
      ...(promptConfig.ttsParameters || {}),
    },
  };
}

function getContextVars(context) {
  return context?.vars || context?.test?.vars || {};
}

function stripTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function parseErrorBody(body) {
  try {
    const parsed = JSON.parse(body);
    return parsed?.error?.message || parsed?.message || body;
  } catch {
    return body;
  }
}

async function* readableToAsyncIterable(readable) {
  if (!readable) {
    return;
  }

  if (typeof readable[Symbol.asyncIterator] === 'function') {
    for await (const chunk of readable) {
      yield chunk;
    }
    return;
  }

  if (typeof readable.getReader === 'function') {
    const reader = readable.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          return;
        }
        yield value;
      }
    } finally {
      reader.releaseLock?.();
    }
  }
}

function extractSseData(block) {
  const dataLines = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);

  if (!dataLines.length) {
    return undefined;
  }

  return dataLines.join('\n');
}

async function* parseSseJsonStream(readable) {
  const decoder = new TextDecoder();
  let buffer = '';

  for await (const chunk of readableToAsyncIterable(readable)) {
    buffer += decoder.decode(chunk, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() || '';

    for (const event of events) {
      const data = extractSseData(event);
      if (!data || data === '[DONE]') {
        continue;
      }

      yield JSON.parse(data);
    }
  }

  buffer += decoder.decode();
  if (!buffer.trim()) {
    return;
  }

  const trailingData = extractSseData(buffer);
  if (trailingData && trailingData !== '[DONE]') {
    yield JSON.parse(trailingData);
  }
}

async function readTtsStream(responseBody) {
  let firstAudioAt;
  let audioByteCount = 0;
  let audioChunkCount = 0;
  let audioUrl;
  let audioId;
  let expiresAt;

  for await (const chunk of parseSseJsonStream(responseBody)) {
    const audio = chunk?.output?.audio;
    if (!audio) {
      continue;
    }

    if (audio.url) {
      audioUrl = audio.url;
    }
    if (audio.id) {
      audioId = audio.id;
    }
    if (audio.expires_at) {
      expiresAt = audio.expires_at;
    }

    if (!audio.data) {
      continue;
    }

    if (!firstAudioAt) {
      firstAudioAt = Date.now();
    }

    audioByteCount += Buffer.from(audio.data, 'base64').length;
    audioChunkCount += 1;
  }

  return {
    firstAudioAt,
    audioByteCount,
    audioUrl,
    audioId,
    expiresAt,
    isStreaming: audioChunkCount > 1,
  };
}

module.exports = class DashScopeTtsProvider {
  constructor(options = {}) {
    this.providerId = options.id || 'dashscope-tts';
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
      process.env.DASHSCOPE_API_KEY ||
      process.env.OPENAI_API_KEY
    );
  }

  async callApi(prompt, context = {}) {
    if (typeof fetch !== 'function') {
      return {
        error: 'Global fetch is unavailable in this Node.js runtime; cannot call DashScope TTS HTTP API.',
      };
    }

    const config = this.getMergedConfig(context);
    const apiKey = this.getApiKey(config);
    if (!apiKey) {
      return {
        error: `Missing API key for ${this.providerId}. Set ${config.apiKeyEnvar || 'DASHSCOPE_API_KEY'}.`,
      };
    }

    const apiBaseUrl = stripTrailingSlash(
      config.apiBaseUrl || process.env.DASHSCOPE_HTTP_BASE_URL || process.env.DASHSCOPE_BASE_URL || '',
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

    const vars = getContextVars(context);
    const synthesisText = String(firstDefined(vars.tts_text, vars.ttsText, prompt) || '').trim();
    if (!synthesisText) {
      return {
        error: `Missing TTS text for ${this.providerId}.`,
      };
    }

    const voice = firstDefined(vars.voice, config.voice);
    if (!voice) {
      return {
        error: `Missing TTS voice for ${this.providerId}.`,
      };
    }

    const stream = config.stream !== false;
    const parameters = { ...(config.ttsParameters || {}) };
    const parameterKeys = ['language_type', 'instructions', 'optimize_instructions', 'volume', 'rate', 'pitch', 'format'];
    for (const key of parameterKeys) {
      const camelKey = key.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
      const value = firstDefined(vars[key], vars[camelKey], config[key]);
      if (value !== undefined) {
        parameters[key] = value;
      }
    }

    const body = {
      model: config.model,
      input: {
        text: synthesisText,
        voice,
      },
      ...(Object.keys(parameters).length > 0 ? { parameters } : {}),
    };

    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(config.headers || {}),
      ...(stream
        ? {
            Accept: 'text/event-stream',
            'X-Accel-Buffering': 'no',
            'X-DashScope-SSE': 'enable',
          }
        : {}),
    };

    const startedAt = Date.now();

    try {
      const response = await fetch(`${apiBaseUrl}${TTS_SERVICE_PATH}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          error: `Request failed with ${response.status}${response.statusText ? ` ${response.statusText}` : ''}: ${parseErrorBody(errorBody)}`,
        };
      }

      let firstAudioAt;
      let audioByteCount = 0;
      let audioUrl;
      let audioId;
      let expiresAt;
      let isStreaming = false;

      if (stream) {
        const streamedResponse = await readTtsStream(response.body);
        firstAudioAt = streamedResponse.firstAudioAt;
        audioByteCount = streamedResponse.audioByteCount;
        audioUrl = streamedResponse.audioUrl;
        audioId = streamedResponse.audioId;
        expiresAt = streamedResponse.expiresAt;
        isStreaming = streamedResponse.isStreaming;
      } else {
        const payload = await response.json();
        const audio = payload?.output?.audio || {};
        audioUrl = audio.url;
        audioId = audio.id;
        expiresAt = audio.expires_at;
      }

      const finishedAt = Date.now();
      const totalLatencyMs = finishedAt - startedAt;
      const generationDurationSeconds = firstAudioAt
        ? Math.max((finishedAt - firstAudioAt) / 1000, 0.001)
        : Math.max(totalLatencyMs / 1000, 0.001);
      const audioBytesPerSecond = isStreaming && audioByteCount > 0
        ? audioByteCount / generationDurationSeconds
        : undefined;

      return {
        output: audioUrl || `[audio ${audioByteCount} bytes]`,
        metadata: {
          apiBaseUrl,
          region: config.region,
          model: config.model,
          requestType: 'tts',
          totalLatencyMs,
          ttftMs: firstAudioAt ? firstAudioAt - startedAt : undefined,
          audioByteCount,
          audioBytesPerSecond,
          inputCharacterCount: synthesisText.length,
          audioUrl,
          audioId,
          expiresAt,
          voice,
        },
      };
    } catch (error) {
      return {
        error: `Request failed for ${this.providerId}: ${error.message}`,
      };
    }
  }
};