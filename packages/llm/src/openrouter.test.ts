import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  OpenRouterProvider,
  providerFactory,
  AuthError,
  RateLimitError,
  InvalidRequestError,
  ProviderTimeoutError,
  ContextWindowExceededError,
  ProviderUnavailableError,
  LLMRequest,
  ToolDefinition,
} from './index.js';
import { LLMProviderType } from '@buildpilot/domain';

describe('OpenRouterProvider Adapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    providerFactory.reset();
  });

  it('instantiates with proper configuration and defaults', () => {
    const provider = new OpenRouterProvider('openrouter:test', {
      providerType: LLMProviderType.OPENROUTER,
      apiKey: 'sk-or-v1-test1234',
      baseUrl: 'https://openrouter.ai/api/v1/',
      defaultModel: 'anthropic/claude-3.5-sonnet',
    });

    expect(provider.id).toBe('openrouter:test');
    expect(provider.providerType).toBe(LLMProviderType.OPENROUTER);
    expect(provider.supports('supportsToolCalling')).toBe(true);
    expect(provider.supports('supportsStreaming')).toBe(true);
  });

  it('formats request body with system prompt and returns parsed text response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'gen-12345',
        model: 'anthropic/claude-3.5-sonnet',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello, I can help you build software!',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 15,
          completion_tokens: 10,
          total_tokens: 25,
        },
      }),
    });

    const provider = new OpenRouterProvider(
      'openrouter:test',
      {
        providerType: LLMProviderType.OPENROUTER,
        apiKey: 'sk-or-v1-test',
      },
      mockFetch as any,
    );

    const request: LLMRequest = {
      model: 'anthropic/claude-3.5-sonnet',
      systemPrompt: 'You are an AI coding assistant.',
      messages: [{ role: 'user', content: 'Introduce yourself' }],
      temperature: 0.2,
      maxTokens: 1000,
    };

    const res = await provider.generate(request);

    expect(res.content).toBe('Hello, I can help you build software!');
    expect(res.finishReason).toBe('stop');
    expect(res.model).toBe('anthropic/claude-3.5-sonnet');
    expect(res.usage).toEqual({
      promptTokens: 15,
      completionTokens: 10,
      totalTokens: 25,
    });

    // Check fetch request payload
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const firstCall = mockFetch.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
    const url = firstCall[0];
    const options = firstCall[1];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(options.headers['Authorization']).toBe('Bearer sk-or-v1-test');

    const sentBody = JSON.parse(options.body);
    expect(sentBody.model).toBe('anthropic/claude-3.5-sonnet');
    expect(sentBody.messages).toHaveLength(2);
    expect(sentBody.messages[0]).toEqual({
      role: 'system',
      content: 'You are an AI coding assistant.',
    });
    expect(sentBody.messages[1]).toEqual({
      role: 'user',
      content: 'Introduce yourself',
    });
  });

  it('formats tool definitions and parses tool calls from OpenRouter response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'gen-tool-1',
        model: 'anthropic/claude-3.5-sonnet',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_read_1',
                  type: 'function',
                  function: {
                    name: 'read_file',
                    arguments: '{"path":"src/server.ts","encoding":"utf8"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 20,
          total_tokens: 70,
        },
      }),
    });

    const provider = new OpenRouterProvider(
      'openrouter:test',
      {
        providerType: LLMProviderType.OPENROUTER,
        apiKey: 'sk-or-v1-test',
      },
      mockFetch as any,
    );

    const tools: ToolDefinition[] = [
      {
        name: 'read_file',
        description: 'Reads contents of a file',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            encoding: { type: 'string' },
          },
          required: ['path'],
        },
      },
    ];

    const request: LLMRequest = {
      model: 'anthropic/claude-3.5-sonnet',
      messages: [{ role: 'user', content: 'Read src/server.ts' }],
      tools,
      toolChoice: 'auto',
    };

    const res = await provider.generate(request);

    expect(res.content).toBeNull();
    expect(res.finishReason).toBe('tool_calls');
    expect(res.toolCalls).toHaveLength(1);
    expect(res.toolCalls?.[0]?.id).toBe('call_read_1');
    expect(res.toolCalls?.[0]?.name).toBe('read_file');
    expect(res.toolCalls?.[0]?.arguments).toEqual({
      path: 'src/server.ts',
      encoding: 'utf8',
    });

    // Verify tools sent in OpenRouter OpenAI format
    const firstCall = mockFetch.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
    const sentBody = JSON.parse(firstCall[1].body);
    expect(sentBody.tools).toHaveLength(1);
    expect(sentBody.tools[0]).toEqual({
      type: 'function',
      function: {
        name: 'read_file',
        description: 'Reads contents of a file',
        parameters: tools[0]!.parameters,
      },
    });
  });

  describe('Error Normalization', () => {
    it('normalizes 401 into AuthError', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: { message: 'Invalid API key provided' } }),
      });

      const provider = new OpenRouterProvider(
        'openrouter:test',
        { providerType: LLMProviderType.OPENROUTER },
        mockFetch as any,
      );

      await expect(
        provider.generate({
          model: 'anthropic/claude-3.5-sonnet',
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      ).rejects.toThrow(AuthError);
    });

    it('normalizes 429 into RateLimitError with retryable=true', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () =>
          JSON.stringify({ error: { message: 'Rate limit exceeded: please back off' } }),
      });

      const provider = new OpenRouterProvider(
        'openrouter:test',
        { providerType: LLMProviderType.OPENROUTER },
        mockFetch as any,
      );

      try {
        await provider.generate({
          model: 'anthropic/claude-3.5-sonnet',
          messages: [{ role: 'user', content: 'Hi' }],
        });
        expect.unreachable();
      } catch (err: any) {
        expect(err).toBeInstanceOf(RateLimitError);
        expect(err.retryable).toBe(true);
        expect(err.statusCode).toBe(429);
      }
    });

    it('normalizes 400 with token overflow into ContextWindowExceededError', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({
            error: { message: 'This model maximum context length is 8192 tokens, but prompt was 10000 tokens' },
          }),
      });

      const provider = new OpenRouterProvider(
        'openrouter:test',
        { providerType: LLMProviderType.OPENROUTER },
        mockFetch as any,
      );

      await expect(
        provider.generate({
          model: 'anthropic/claude-3.5-sonnet',
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      ).rejects.toThrow(ContextWindowExceededError);
    });

    it('normalizes 400 generic error into InvalidRequestError', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ error: { message: 'Temperature must be between 0 and 2' } }),
      });

      const provider = new OpenRouterProvider(
        'openrouter:test',
        { providerType: LLMProviderType.OPENROUTER },
        mockFetch as any,
      );

      await expect(
        provider.generate({
          model: 'anthropic/claude-3.5-sonnet',
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      ).rejects.toThrow(InvalidRequestError);
    });

    it('normalizes 503 into ProviderUnavailableError with retryable=true', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'Service Temporarily Unavailable',
      });

      const provider = new OpenRouterProvider(
        'openrouter:test',
        { providerType: LLMProviderType.OPENROUTER },
        mockFetch as any,
      );

      try {
        await provider.generate({
          model: 'anthropic/claude-3.5-sonnet',
          messages: [{ role: 'user', content: 'Hi' }],
        });
        expect.unreachable();
      } catch (err: any) {
        expect(err).toBeInstanceOf(ProviderUnavailableError);
        expect(err.retryable).toBe(true);
      }
    });

    it('normalizes AbortError into ProviderTimeoutError', async () => {
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';

      const mockFetch = vi.fn().mockRejectedValue(abortErr);

      const provider = new OpenRouterProvider(
        'openrouter:test',
        { providerType: LLMProviderType.OPENROUTER, timeoutMs: 5000 },
        mockFetch as any,
      );

      await expect(
        provider.generate({
          model: 'anthropic/claude-3.5-sonnet',
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      ).rejects.toThrow(ProviderTimeoutError);
    });
  });

  describe('Streaming Functionality', () => {
    it('streams chunks from SSE stream response', async () => {
      const sseChunks = [
        'data: {"id":"gen-1","model":"anthropic/claude-3.5-sonnet","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
        'data: {"id":"gen-1","model":"anthropic/claude-3.5-sonnet","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}\n\n',
        'data: {"id":"gen-1","model":"anthropic/claude-3.5-sonnet","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          for (const chunk of sseChunks) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        },
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: stream,
      });

      const provider = new OpenRouterProvider(
        'openrouter:test',
        { providerType: LLMProviderType.OPENROUTER },
        mockFetch as any,
      );

      const chunks: string[] = [];
      let lastFinishReason: string | undefined;

      for await (const chunk of provider.stream({
        model: 'anthropic/claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'Hi' }],
      })) {
        if (chunk.delta.content) {
          chunks.push(chunk.delta.content);
        }
        if (chunk.finishReason) {
          lastFinishReason = chunk.finishReason;
        }
      }

      expect(chunks.join('')).toBe('Hello world');
      expect(lastFinishReason).toBe('stop');
    });
  });

  describe('ProviderFactory Integration', () => {
    it('creates OpenRouterProvider via providerFactory.create', () => {
      const provider = providerFactory.create({
        providerType: LLMProviderType.OPENROUTER,
        apiKey: 'sk-or-v1-abc',
        defaultModel: 'anthropic/claude-3.5-sonnet',
      });

      expect(provider).toBeInstanceOf(OpenRouterProvider);
      expect(provider.providerType).toBe(LLMProviderType.OPENROUTER);
      expect(provider.id).toBe('openrouter:anthropic/claude-3.5-sonnet');
    });
  });

  describe('validateConnection', () => {
    it('validates connection when API responds with 200', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });

      const provider = new OpenRouterProvider(
        'openrouter:test',
        { providerType: LLMProviderType.OPENROUTER, apiKey: 'sk-or-v1-valid' },
        mockFetch as any,
      );

      const isValid = await provider.validateConnection();
      expect(isValid).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/auth/key',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer sk-or-v1-valid',
          }),
        }),
      );
    });

    it('throws AuthError when validating without API key', async () => {
      const provider = new OpenRouterProvider('openrouter:test', {
        providerType: LLMProviderType.OPENROUTER,
        apiKey: '',
      });

      await expect(provider.validateConnection()).rejects.toThrow(AuthError);
    });
  });
});
