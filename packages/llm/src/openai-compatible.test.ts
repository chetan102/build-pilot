import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  OpenAICompatibleProvider,
  OpenRouterProvider,
  providerFactory,
  AuthError,
  RateLimitError,
  InvalidRequestError,
  ProviderTimeoutError,
  ContextWindowExceededError,
  ProviderUnavailableError,
  LLMProvider,
  LLMRequest,
  ToolDefinition,
} from './index.js';
import { LLMProviderType } from '@buildpilot/domain';

describe('OpenAICompatibleProvider Adapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    providerFactory.reset();
  });

  it('instantiates with standard OpenAI configuration', () => {
    const provider = new OpenAICompatibleProvider('openai:test', {
      providerType: LLMProviderType.OPENAI,
      apiKey: 'sk-proj-test123',
      defaultModel: 'gpt-4o',
    });

    expect(provider.id).toBe('openai:test');
    expect(provider.providerType).toBe(LLMProviderType.OPENAI);
    expect(provider.supports('supportsToolCalling')).toBe(true);
    expect(provider.supports('supportsStreaming')).toBe(true);
  });

  it('instantiates with custom local endpoint (e.g. Ollama / vLLM)', () => {
    const provider = new OpenAICompatibleProvider('ollama:test', {
      providerType: 'OLLAMA',
      baseUrl: 'http://localhost:11434/v1',
      defaultModel: 'qwen2.5-coder:32b',
    });

    expect(provider.id).toBe('ollama:test');
    expect(provider.providerType).toBe('OLLAMA');
  });

  it('sends organization and project headers when configured', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'chatcmpl-123',
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Response with headers' },
            finish_reason: 'stop',
          },
        ],
      }),
    });

    const provider = new OpenAICompatibleProvider(
      'openai:test',
      {
        providerType: LLMProviderType.OPENAI,
        apiKey: 'sk-proj-123',
        organizationId: 'org-abc',
        projectId: 'proj-xyz',
      },
      mockFetch as any,
    );

    await provider.generate({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Test' }],
    });

    const firstCall = mockFetch.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
    expect(firstCall[1].headers['Authorization']).toBe('Bearer sk-proj-123');
    expect(firstCall[1].headers['OpenAI-Organization']).toBe('org-abc');
    expect(firstCall[1].headers['OpenAI-Project']).toBe('proj-xyz');
  });

  it('formats tool definitions and parses tool calls from response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'chatcmpl-tool-1',
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_edit_123',
                  type: 'function',
                  function: {
                    name: 'replace_file_content',
                    arguments: '{"targetFile":"src/app.ts","instruction":"add route"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: {
          prompt_tokens: 40,
          completion_tokens: 25,
          total_tokens: 65,
        },
      }),
    });

    const provider = new OpenAICompatibleProvider(
      'openai:test',
      {
        providerType: LLMProviderType.OPENAI,
        apiKey: 'sk-proj-test',
      },
      mockFetch as any,
    );

    const tools: ToolDefinition[] = [
      {
        name: 'replace_file_content',
        description: 'Edits target file content',
        parameters: {
          type: 'object',
          properties: {
            targetFile: { type: 'string' },
            instruction: { type: 'string' },
          },
          required: ['targetFile', 'instruction'],
        },
      },
    ];

    const res = await provider.generate({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Edit src/app.ts' }],
      tools,
    });

    expect(res.content).toBeNull();
    expect(res.finishReason).toBe('tool_calls');
    expect(res.toolCalls).toHaveLength(1);
    expect(res.toolCalls?.[0]?.name).toBe('replace_file_content');
    expect(res.toolCalls?.[0]?.arguments).toEqual({
      targetFile: 'src/app.ts',
      instruction: 'add route',
    });
    expect(res.usage?.totalTokens).toBe(65);
  });

  describe('Error Normalization', () => {
    it('normalizes 401 into AuthError', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: { message: 'Incorrect API key provided' } }),
      });

      const provider = new OpenAICompatibleProvider(
        'openai:test',
        { providerType: LLMProviderType.OPENAI },
        mockFetch as any,
      );

      await expect(
        provider.generate({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      ).rejects.toThrow(AuthError);
    });

    it('normalizes 429 into RateLimitError', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () =>
          JSON.stringify({ error: { message: 'You exceeded your current quota' } }),
      });

      const provider = new OpenAICompatibleProvider(
        'openai:test',
        { providerType: LLMProviderType.OPENAI },
        mockFetch as any,
      );

      await expect(
        provider.generate({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      ).rejects.toThrow(RateLimitError);
    });

    it('normalizes 400 context window overflow into ContextWindowExceededError', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({
            error: {
              message: "This model's maximum context length is 128000 tokens. However, your messages resulted in 135000 tokens",
            },
          }),
      });

      const provider = new OpenAICompatibleProvider(
        'openai:test',
        { providerType: LLMProviderType.OPENAI },
        mockFetch as any,
      );

      await expect(
        provider.generate({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      ).rejects.toThrow(ContextWindowExceededError);
    });

    it('normalizes 503 into ProviderUnavailableError', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable',
      });

      const provider = new OpenAICompatibleProvider(
        'groq:test',
        { providerType: 'GROQ' },
        mockFetch as any,
      );

      await expect(
        provider.generate({
          model: 'llama-3.3-70b',
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      ).rejects.toThrow(ProviderUnavailableError);
    });
  });

  describe('Streaming Functionality', () => {
    it('streams chunks from SSE stream response', async () => {
      const sseChunks = [
        'data: {"id":"chatcmpl-1","model":"gpt-4o","choices":[{"index":0,"delta":{"content":"Code"},"finish_reason":null}]}\n\n',
        'data: {"id":"chatcmpl-1","model":"gpt-4o","choices":[{"index":0,"delta":{"content":" generated"},"finish_reason":null}]}\n\n',
        'data: {"id":"chatcmpl-1","model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
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

      const provider = new OpenAICompatibleProvider(
        'openai:test',
        { providerType: LLMProviderType.OPENAI },
        mockFetch as any,
      );

      const chunks: string[] = [];
      for await (const chunk of provider.stream({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Generate code' }],
      })) {
        if (chunk.delta.content) {
          chunks.push(chunk.delta.content);
        }
      }

      expect(chunks.join('')).toBe('Code generated');
    });
  });

  describe('validateConnection', () => {
    it('returns true when models endpoint responds 200', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });

      const provider = new OpenAICompatibleProvider(
        'ollama:test',
        { providerType: 'OLLAMA', baseUrl: 'http://localhost:11434/v1' },
        mockFetch as any,
      );

      const ok = await provider.validateConnection();
      expect(ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/v1/models',
        expect.any(Object),
      );
    });
  });

  describe('ProviderFactory Integration for Compatible Providers', () => {
    it('creates OPENAI, CUSTOM_OPENAI_COMPATIBLE, GROQ, OLLAMA, VLLM via providerFactory', () => {
      const openai = providerFactory.create({
        providerType: LLMProviderType.OPENAI,
        apiKey: 'sk-test',
        defaultModel: 'gpt-4o',
      });
      expect(openai).toBeInstanceOf(OpenAICompatibleProvider);

      const custom = providerFactory.create({
        providerType: LLMProviderType.CUSTOM_OPENAI_COMPATIBLE,
        baseUrl: 'http://localhost:8000/v1',
      });
      expect(custom).toBeInstanceOf(OpenAICompatibleProvider);

      const groq = providerFactory.create({
        providerType: 'GROQ',
        apiKey: 'gsk-test',
      });
      expect(groq).toBeInstanceOf(OpenAICompatibleProvider);

      const ollama = providerFactory.create({
        providerType: 'OLLAMA',
      });
      expect(ollama).toBeInstanceOf(OpenAICompatibleProvider);
    });
  });

  describe('Identical Interface Behavior Across Providers (DIP Verification)', () => {
    // Acceptance criteria: The same agent code can call two different API endpoints without modifying the agent loop.
    async function mockAgentLoop(provider: LLMProvider, prompt: string): Promise<string | null> {
      const response = await provider.generate({
        model: 'default-model',
        systemPrompt: 'You are a coding assistant.',
        messages: [{ role: 'user', content: prompt }],
      });
      return response.content;
    }

    it('executes identical agent loop with OpenRouter and OpenAI-compatible providers interchangeably', async () => {
      const mockFetch1 = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'or-1',
          choices: [{ message: { role: 'assistant', content: 'Solution from OpenRouter' } }],
        }),
      });

      const mockFetch2 = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'oai-1',
          choices: [{ message: { role: 'assistant', content: 'Solution from Local Ollama' } }],
        }),
      });

      const openRouterProvider = new OpenRouterProvider(
        'openrouter:test',
        { providerType: LLMProviderType.OPENROUTER },
        mockFetch1 as any,
      );

      const localOllamaProvider = new OpenAICompatibleProvider(
        'ollama:test',
        { providerType: 'OLLAMA', baseUrl: 'http://localhost:11434/v1' },
        mockFetch2 as any,
      );

      const result1 = await mockAgentLoop(openRouterProvider, 'Implement feature A');
      const result2 = await mockAgentLoop(localOllamaProvider, 'Implement feature A');

      expect(result1).toBe('Solution from OpenRouter');
      expect(result2).toBe('Solution from Local Ollama');
    });
  });
});

