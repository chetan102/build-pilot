import { LLMProviderKind, LLMProviderType } from '@buildpilot/domain';
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

export interface AnthropicConfig extends Omit<ProviderConfig, 'providerType'> {
  providerType?: string;
  apiKey?: string;
  baseUrl?: string;
  anthropicVersion?: string;
}

export class AnthropicProvider extends BaseLLMProvider {
  private apiKey: string;
  private baseUrl: string;
  private anthropicVersion: string;
  private fetchFn: typeof fetch;

  constructor(
    id = 'anthropic:default',
    config: AnthropicConfig = { providerType: LLMProviderType.ANTHROPIC },
    fetchFn: typeof fetch = globalThis.fetch,
  ) {
    const providerType = config.providerType || LLMProviderType.ANTHROPIC;
    super(id, providerType, { ...config, providerType });
    this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY || '';
    this.baseUrl = (config.baseUrl || 'https://api.anthropic.com/v1').replace(/\/+$/, '');
    this.anthropicVersion = config.anthropicVersion || '2023-06-01';
    this.fetchFn = fetchFn;
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    this.validateRequest(request);

    const model = request.model || this.config.defaultModel || 'claude-3-5-sonnet-20241022';
    const url = `${this.baseUrl}/messages`;
    const body = this.formatRequestBody(request);
    const timeoutMs = request.timeoutMs || this.config.timeoutMs || 60000;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': this.anthropicVersion,
          ...(this.config.headers || {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === 'AbortError' || err.name === 'TimeoutError') {
        throw new ProviderTimeoutError(`Anthropic request timed out after ${timeoutMs}ms`, timeoutMs, {
          provider: this.providerType,
          model,
        });
      }
      throw new ProviderUnavailableError(`Failed to reach Anthropic provider: ${err.message}`, {
        provider: this.providerType,
        model,
        rawError: err,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const errorText = await res.text();
      this.handleHttpError(res.status, errorText, model);
    }

    const data = (await res.json()) as any;
    return this.parseResponse(data, model);
  }

  async *stream(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    const res = await this.generate(request);
    yield {
      delta: {
        content: res.content || undefined,
        toolCalls: res.toolCalls?.map((tc, idx) => ({
          index: idx,
          id: tc.id,
          name: tc.name,
          argumentsDelta: tc.rawArguments,
        })),
      },
      finishReason: res.finishReason,
      usage: res.usage,
      model: res.model,
    };
  }

  async validateConnection(): Promise<boolean> {
    return Boolean(this.apiKey);
  }

  private formatRequestBody(request: LLMRequest): Record<string, unknown> {
    const messages: Array<Record<string, unknown>> = [];

    for (const msg of request.messages) {
      if (msg.role === 'system') continue; // system prompt passed at top level

      const contentBlocks: any[] = [];
      if (msg.content) {
        contentBlocks.push({ type: 'text', text: msg.content });
      }

      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          contentBlocks.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: typeof tc.arguments === 'string' ? JSON.parse(tc.arguments) : tc.arguments,
          });
        }
      }

      if (msg.role === 'tool' && msg.toolCallId) {
        contentBlocks.push({
          type: 'tool_result',
          tool_use_id: msg.toolCallId,
          content: msg.content,
        });
      }

      messages.push({
        role: msg.role === 'tool' ? 'user' : msg.role,
        content: contentBlocks.length === 1 && contentBlocks[0].type === 'text' ? contentBlocks[0].text : contentBlocks,
      });
    }

    const body: Record<string, unknown> = {
      model: request.model || this.config.defaultModel || 'claude-3-5-sonnet-20241022',
      max_tokens: request.maxTokens || 4096,
      messages,
    };

    if (request.systemPrompt) {
      body.system = request.systemPrompt;
    }

    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }

    if (request.topP !== undefined) {
      body.top_p = request.topP;
    }

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }

    return body;
  }

  private parseResponse(data: any, model: string): LLMResponse {
    let textContent = '';
    const toolCalls: ToolCall[] = [];

    if (Array.isArray(data.content)) {
      for (const block of data.content) {
        if (block.type === 'text') {
          textContent += block.text;
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            name: block.name,
            arguments: block.input || {},
            rawArguments: JSON.stringify(block.input || {}),
          });
        }
      }
    }

    let usage: TokenUsage | undefined;
    if (data.usage) {
      usage = {
        promptTokens: data.usage.input_tokens || 0,
        completionTokens: data.usage.output_tokens || 0,
        totalTokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
      };
    }

    let finishReason: LLMFinishReason = 'stop';
    if (data.stop_reason === 'tool_use') finishReason = 'tool_calls';
    else if (data.stop_reason === 'max_tokens') finishReason = 'length';

    return {
      content: textContent || null,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason,
      usage,
      model: data.model || model,
      rawResponse: data,
    };
  }

  private handleHttpError(statusCode: number, errorText: string, model: string): never {
    let parsedMessage = errorText;
    try {
      const parsed = JSON.parse(errorText);
      if (parsed.error?.message) {
        parsedMessage = parsed.error.message;
      }
    } catch {
      // ignore
    }

    const details = {
      provider: this.providerType,
      model,
      statusCode,
      rawError: errorText,
    };

    if (statusCode === 401 || statusCode === 403) {
      throw new AuthError(`Anthropic authentication error: ${parsedMessage}`, details);
    }
    if (statusCode === 429) {
      throw new RateLimitError(`Anthropic rate limit exceeded: ${parsedMessage}`, details);
    }
    if (statusCode === 400) {
      throw new InvalidRequestError(`Anthropic invalid request: ${parsedMessage}`, details);
    }
    if (statusCode >= 500) {
      throw new ProviderUnavailableError(`Anthropic service error (${statusCode}): ${parsedMessage}`, details);
    }

    throw new LLMError(`Anthropic request failed (${statusCode}): ${parsedMessage}`, 'ANTHROPIC_ERROR', details);
  }
}
