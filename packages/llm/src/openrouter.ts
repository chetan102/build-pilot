import { LLMProviderType } from '@buildpilot/domain';
import { BaseLLMProvider } from './base-provider.js';
import {
  LLMRequest,
  LLMResponse,
  LLMStreamChunk,
  ToolCall,
  ToolDefinition,
  ProviderConfig,
  TokenUsage,
  LLMFinishReason,
  ToolCallDelta,
} from './types.js';
import {
  AuthError,
  RateLimitError,
  InvalidRequestError,
  ProviderTimeoutError,
  ContextWindowExceededError,
  ProviderUnavailableError,
  LLMError,
} from './errors.js';

export interface OpenRouterConfig extends ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  siteUrl?: string;
  siteName?: string;
}

export class OpenRouterProvider extends BaseLLMProvider {
  private apiKey: string;
  private baseUrl: string;
  private siteUrl: string;
  private siteName: string;
  private fetchFn: typeof fetch;

  constructor(
    id = 'openrouter:default',
    config: OpenRouterConfig = { providerType: LLMProviderType.OPENROUTER },
    fetchFn: typeof fetch = globalThis.fetch,
  ) {
    super(id, LLMProviderType.OPENROUTER, config);
    this.apiKey = config.apiKey || process.env.OPENROUTER_API_KEY || '';
    this.baseUrl = (config.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
    this.siteUrl = config.siteUrl || 'https://buildpilot.dev';
    this.siteName = config.siteName || 'BuildPilot';
    this.fetchFn = fetchFn;
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    this.validateRequest(request);

    const body = this.formatRequestBody(request, false);
    const headers = this.buildHeaders(request);
    const timeoutMs = request.timeoutMs || this.config.timeoutMs || 60000;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === 'AbortError' || err.name === 'TimeoutError') {
        throw new ProviderTimeoutError(
          `OpenRouter request timed out after ${timeoutMs}ms`,
          timeoutMs,
          {
            provider: this.providerType,
            model: request.model,
          },
        );
      }
      throw new ProviderUnavailableError(
        `Failed to reach OpenRouter API: ${err.message}`,
        {
          provider: this.providerType,
          model: request.model,
          rawError: err,
        },
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const errorText = await res.text();
      this.handleHttpError(res.status, errorText, request.model);
    }

    const data = (await res.json()) as any;
    return this.parseResponse(data, request.model);
  }

  async *stream(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    this.validateRequest(request);

    const body = this.formatRequestBody(request, true);
    const headers = this.buildHeaders(request);
    const timeoutMs = request.timeoutMs || this.config.timeoutMs || 90000;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === 'AbortError' || err.name === 'TimeoutError') {
        throw new ProviderTimeoutError(
          `OpenRouter stream timed out after ${timeoutMs}ms`,
          timeoutMs,
          {
            provider: this.providerType,
            model: request.model,
          },
        );
      }
      throw new ProviderUnavailableError(
        `Failed to establish OpenRouter stream: ${err.message}`,
        {
          provider: this.providerType,
          model: request.model,
          rawError: err,
        },
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const errorText = await res.text();
      this.handleHttpError(res.status, errorText, request.model);
    }

    if (!res.body) {
      throw new ProviderUnavailableError('Empty response body received from OpenRouter stream', {
        provider: this.providerType,
        model: request.model,
      });
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue; // Skip SSE comments
          if (trimmed === 'data: [DONE]') {
            return;
          }

          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6);
            try {
              const parsed = JSON.parse(jsonStr);
              const chunk = this.parseStreamChunk(parsed, request.model);
              if (chunk) {
                yield chunk;
              }
            } catch {
              // Ignore malformed intermediate chunks
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async validateConnection(): Promise<boolean> {
    if (!this.apiKey) {
      throw new AuthError('OpenRouter API key is missing', { provider: this.providerType });
    }

    try {
      const res = await this.fetchFn(`${this.baseUrl}/auth/key`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private buildHeaders(request: LLMRequest): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'HTTP-Referer': this.siteUrl,
      'X-Title': this.siteName,
      ...(this.config.headers || {}),
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    return headers;
  }

  private formatRequestBody(request: LLMRequest, stream = false): Record<string, unknown> {
    const messages: Array<Record<string, unknown>> = [];

    // If systemPrompt is provided separately, prepend it as the first message
    if (request.systemPrompt) {
      messages.push({
        role: 'system',
        content: request.systemPrompt,
      });
    }

    // Convert LLMMessage[] into OpenRouter / OpenAI format
    for (const msg of request.messages) {
      const formatted: Record<string, unknown> = {
        role: msg.role,
        content: msg.content,
      };

      if (msg.name) {
        formatted.name = msg.name;
      }

      if (msg.toolCallId) {
        formatted.tool_call_id = msg.toolCallId;
      }

      if (msg.toolCalls && msg.toolCalls.length > 0) {
        formatted.tool_calls = msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments),
          },
        }));
      }

      messages.push(formatted);
    }

    const body: Record<string, unknown> = {
      model: request.model,
      messages,
      stream,
    };

    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }

    if (request.maxTokens !== undefined) {
      body.max_tokens = request.maxTokens;
    }

    if (request.topP !== undefined) {
      body.top_p = request.topP;
    }

    if (request.stopSequences && request.stopSequences.length > 0) {
      body.stop = request.stopSequences;
    }

    // Format tool definitions
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map((t) => this.formatToolDefinition(t));
      if (request.toolChoice) {
        body.tool_choice = request.toolChoice;
      }
    }

    return body;
  }

  private formatToolDefinition(tool: ToolDefinition): Record<string, unknown> {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    };
  }

  private parseResponse(data: any, defaultModel: string): LLMResponse {
    const choice = data.choices?.[0];
    if (!choice) {
      return {
        content: null,
        model: data.model || defaultModel,
        rawResponse: data,
      };
    }

    const message = choice.message || {};
    const content = message.content ?? null;

    let toolCalls: ToolCall[] | undefined;
    if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
      toolCalls = message.tool_calls.map((tc: any) => {
        let args: Record<string, unknown> = {};
        const rawArgs = tc.function?.arguments || '{}';
        try {
          args = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;
        } catch {
          args = { _raw: rawArgs };
        }

        return {
          id: tc.id || `call_${Math.random().toString(36).slice(2, 9)}`,
          name: tc.function?.name || '',
          arguments: args,
          rawArguments: typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs),
        };
      });
    }

    let usage: TokenUsage | undefined;
    if (data.usage) {
      usage = {
        promptTokens: data.usage.prompt_tokens || 0,
        completionTokens: data.usage.completion_tokens || 0,
        totalTokens: data.usage.total_tokens || 0,
      };
    }

    return {
      content,
      toolCalls,
      finishReason: this.mapFinishReason(choice.finish_reason),
      usage,
      model: data.model || defaultModel,
      rawResponse: data,
    };
  }

  private parseStreamChunk(data: any, defaultModel: string): LLMStreamChunk | null {
    const choice = data.choices?.[0];
    if (!choice) return null;

    const delta = choice.delta || {};
    const toolCalls: ToolCallDelta[] | undefined = Array.isArray(delta.tool_calls)
      ? delta.tool_calls.map((tc: any) => ({
          index: tc.index ?? 0,
          id: tc.id,
          name: tc.function?.name,
          argumentsDelta: tc.function?.arguments,
        }))
      : undefined;

    let usage: TokenUsage | undefined;
    if (data.usage) {
      usage = {
        promptTokens: data.usage.prompt_tokens || 0,
        completionTokens: data.usage.completion_tokens || 0,
        totalTokens: data.usage.total_tokens || 0,
      };
    }

    return {
      delta: {
        content: delta.content,
        toolCalls,
      },
      finishReason: choice.finish_reason ? this.mapFinishReason(choice.finish_reason) : undefined,
      usage,
      model: data.model || defaultModel,
    };
  }

  private mapFinishReason(reason?: string): LLMFinishReason {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'tool_calls':
      case 'function_call':
        return 'tool_calls';
      case 'length':
        return 'length';
      case 'content_filter':
        return 'content_filter';
      case 'error':
        return 'error';
      default:
        return 'other';
    }
  }

  private handleHttpError(statusCode: number, errorText: string, model: string): never {
    let parsedMessage = errorText;
    let errorCode: string | undefined;

    try {
      const parsed = JSON.parse(errorText);
      if (parsed.error) {
        parsedMessage = parsed.error.message || errorText;
        errorCode = parsed.error.code ? String(parsed.error.code) : undefined;
      }
    } catch {
      // Use raw text
    }

    const details = {
      provider: this.providerType,
      model,
      statusCode,
      rawError: errorText,
    };

    if (statusCode === 401 || statusCode === 403) {
      throw new AuthError(`OpenRouter authentication failed: ${parsedMessage}`, details);
    }

    if (statusCode === 429) {
      throw new RateLimitError(`OpenRouter rate limit exceeded: ${parsedMessage}`, details);
    }

    if (
      statusCode === 400 &&
      (parsedMessage.toLowerCase().includes('context') ||
        parsedMessage.toLowerCase().includes('maximum context length') ||
        parsedMessage.toLowerCase().includes('too many tokens'))
    ) {
      throw new ContextWindowExceededError(
        `OpenRouter context window exceeded: ${parsedMessage}`,
        details,
      );
    }

    if (statusCode === 400) {
      throw new InvalidRequestError(`OpenRouter invalid request: ${parsedMessage}`, details);
    }

    if (statusCode === 408 || statusCode === 504) {
      throw new ProviderTimeoutError(`OpenRouter request timed out: ${parsedMessage}`, 60000, details);
    }

    if (statusCode >= 500) {
      throw new ProviderUnavailableError(
        `OpenRouter service unavailable (${statusCode}): ${parsedMessage}`,
        details,
      );
    }

    throw new LLMError(
      `OpenRouter request failed with status ${statusCode}: ${parsedMessage}`,
      errorCode || 'OPENROUTER_ERROR',
      details,
    );
  }
}

