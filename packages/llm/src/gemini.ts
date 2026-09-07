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

export interface GeminiConfig extends Omit<ProviderConfig, 'providerType'> {
  providerType?: string;
  apiKey?: string;
  baseUrl?: string;
}

export class GeminiProvider extends BaseLLMProvider {
  private apiKey: string;
  private baseUrl: string;
  private fetchFn: typeof fetch;

  constructor(
    id = 'gemini:default',
    config: GeminiConfig = { providerType: LLMProviderType.GEMINI },
    fetchFn: typeof fetch = globalThis.fetch,
  ) {
    const providerType = config.providerType || LLMProviderType.GEMINI;
    super(id, providerType, { ...config, providerType });
    this.apiKey = config.apiKey || process.env.GEMINI_API_KEY || '';
    this.baseUrl = (config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
    this.fetchFn = fetchFn;
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    this.validateRequest(request);

    const model = request.model || this.config.defaultModel || 'gemini-1.5-pro';
    const cleanModel = model.replace(/^models\//, '');
    const url = `${this.baseUrl}/models/${cleanModel}:generateContent?key=${this.apiKey}`;
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
          ...(this.config.headers || {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === 'AbortError' || err.name === 'TimeoutError') {
        throw new ProviderTimeoutError(`Gemini request timed out after ${timeoutMs}ms`, timeoutMs, {
          provider: this.providerType,
          model,
        });
      }
      throw new ProviderUnavailableError(`Failed to reach Gemini provider: ${err.message}`, {
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
    // For non-streaming fallback or streamGenerateContent
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
    try {
      const res = await this.fetchFn(`${this.baseUrl}/models?key=${this.apiKey}`, {
        method: 'GET',
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private formatRequestBody(request: LLMRequest): Record<string, unknown> {
    const contents: Array<Record<string, unknown>> = [];

    for (const msg of request.messages) {
      let role = msg.role === 'assistant' ? 'model' : 'user';
      if (msg.role === 'system') {
        role = 'user'; // Gemini system instruction or user message
      }

      const parts: Array<Record<string, unknown>> = [];

      if (msg.content) {
        parts.push({ text: msg.content });
      }

      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          parts.push({
            functionCall: {
              name: tc.name,
              args: typeof tc.arguments === 'string' ? JSON.parse(tc.arguments) : tc.arguments,
            },
          });
        }
      }

      if (msg.role === 'tool' && msg.toolCallId) {
        parts.push({
          functionResponse: {
            name: msg.name || 'tool_response',
            response: { content: msg.content },
          },
        });
      }

      if (parts.length > 0) {
        contents.push({ role, parts });
      }
    }

    const body: Record<string, unknown> = { contents };

    if (request.systemPrompt) {
      body.systemInstruction = {
        parts: [{ text: request.systemPrompt }],
      };
    }

    const genConfig: Record<string, unknown> = {};
    if (request.temperature !== undefined) genConfig.temperature = request.temperature;
    if (request.maxTokens !== undefined) genConfig.maxOutputTokens = request.maxTokens;
    if (request.topP !== undefined) genConfig.topP = request.topP;
    if (request.stopSequences) genConfig.stopSequences = request.stopSequences;

    if (Object.keys(genConfig).length > 0) {
      body.generationConfig = genConfig;
    }

    if (request.tools && request.tools.length > 0) {
      body.tools = [
        {
          functionDeclarations: request.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ];
    }

    return body;
  }

  private parseResponse(data: any, model: string): LLMResponse {
    const candidate = data.candidates?.[0];
    if (!candidate) {
      return {
        content: null,
        model,
        rawResponse: data,
      };
    }

    let textContent = '';
    const toolCalls: ToolCall[] = [];

    if (candidate.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.text) {
          textContent += part.text;
        }
        if (part.functionCall) {
          toolCalls.push({
            id: `call_${Math.random().toString(36).slice(2, 9)}`,
            name: part.functionCall.name,
            arguments: part.functionCall.args || {},
            rawArguments: JSON.stringify(part.functionCall.args || {}),
          });
        }
      }
    }

    let usage: TokenUsage | undefined;
    if (data.usageMetadata) {
      usage = {
        promptTokens: data.usageMetadata.promptTokenCount || 0,
        completionTokens: data.usageMetadata.candidatesTokenCount || 0,
        totalTokens: data.usageMetadata.totalTokenCount || 0,
      };
    }

    return {
      content: textContent || null,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: candidate.finishReason === 'STOP' ? 'stop' : toolCalls.length > 0 ? 'tool_calls' : 'other',
      usage,
      model,
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
      throw new AuthError(`Gemini authentication error: ${parsedMessage}`, details);
    }
    if (statusCode === 429) {
      throw new RateLimitError(`Gemini rate limit exceeded: ${parsedMessage}`, details);
    }
    if (statusCode === 400) {
      throw new InvalidRequestError(`Gemini invalid request: ${parsedMessage}`, details);
    }
    if (statusCode >= 500) {
      throw new ProviderUnavailableError(`Gemini service error (${statusCode}): ${parsedMessage}`, details);
    }

    throw new LLMError(`Gemini request failed (${statusCode}): ${parsedMessage}`, 'GEMINI_ERROR', details);
  }
}
