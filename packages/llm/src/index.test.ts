import { describe, it, expect, beforeEach } from 'vitest';
import {
  LLMError,
  RateLimitError,
  AuthError,
  InvalidRequestError,
  ProviderTimeoutError,
  ContextWindowExceededError,
  ProviderUnavailableError,
  ToolDefinitionSchema,
  ToolCallSchema,
  ToolResultSchema,
  LLMMessageSchema,
  ProviderConfigSchema,
  MockLLMProvider,
  ProviderFactory,
  providerFactory,
  LLMRequest,
  LLMResponse,
} from './index.js';

describe('LLM Package — Generic Provider Contract & Architecture', () => {
  beforeEach(() => {
    providerFactory.reset();
  });

  describe('Error Hierarchy & Normalization', () => {
    it('creates LLMError with code and details', () => {
      const err = new LLMError('Custom error', 'CUSTOM_CODE', {
        provider: 'OPENROUTER',
        model: 'claude-3.5',
        statusCode: 500,
        retryable: true,
      });

      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(LLMError);
      expect(err.code).toBe('CUSTOM_CODE');
      expect(err.provider).toBe('OPENROUTER');
      expect(err.model).toBe('claude-3.5');
      expect(err.statusCode).toBe(500);
      expect(err.retryable).toBe(true);
    });

    it('creates RateLimitError with retryable=true and retryAfterMs', () => {
      const err = new RateLimitError('Rate limit hit', {
        provider: 'OPENROUTER',
        retryAfterMs: 3000,
      });

      expect(err).toBeInstanceOf(RateLimitError);
      expect(err).toBeInstanceOf(LLMError);
      expect(err.code).toBe('RATE_LIMIT_ERROR');
      expect(err.statusCode).toBe(429);
      expect(err.retryable).toBe(true);
      expect(err.retryAfterMs).toBe(3000);
    });

    it('creates AuthError with retryable=false and statusCode 401', () => {
      const err = new AuthError('Invalid API key', { provider: 'OPENAI' });

      expect(err).toBeInstanceOf(AuthError);
      expect(err.code).toBe('AUTH_ERROR');
      expect(err.statusCode).toBe(401);
      expect(err.retryable).toBe(false);
    });

    it('creates InvalidRequestError with param detail', () => {
      const err = new InvalidRequestError('Missing required field', {
        param: 'messages',
        provider: 'GEMINI',
      });

      expect(err).toBeInstanceOf(InvalidRequestError);
      expect(err.code).toBe('INVALID_REQUEST_ERROR');
      expect(err.statusCode).toBe(400);
      expect(err.param).toBe('messages');
      expect(err.retryable).toBe(false);
    });

    it('creates ProviderTimeoutError with timeoutMs and retryable=true', () => {
      const err = new ProviderTimeoutError('Request timed out', 30000, {
        provider: 'ANTHROPIC',
      });

      expect(err).toBeInstanceOf(ProviderTimeoutError);
      expect(err.code).toBe('PROVIDER_TIMEOUT_ERROR');
      expect(err.statusCode).toBe(408);
      expect(err.timeoutMs).toBe(30000);
      expect(err.retryable).toBe(true);
    });

    it('creates ContextWindowExceededError with token limits', () => {
      const err = new ContextWindowExceededError('Context window exceeded', {
        maxTokens: 8000,
        requestedTokens: 12000,
        provider: 'OPENAI',
      });

      expect(err).toBeInstanceOf(ContextWindowExceededError);
      expect(err.code).toBe('CONTEXT_WINDOW_EXCEEDED_ERROR');
      expect(err.maxTokens).toBe(8000);
      expect(err.requestedTokens).toBe(12000);
      expect(err.retryable).toBe(false);
    });

    it('creates ProviderUnavailableError with retryable=true and statusCode 503', () => {
      const err = new ProviderUnavailableError('Provider server overloaded', {
        provider: 'OPENROUTER',
      });

      expect(err).toBeInstanceOf(ProviderUnavailableError);
      expect(err.code).toBe('PROVIDER_UNAVAILABLE_ERROR');
      expect(err.statusCode).toBe(503);
      expect(err.retryable).toBe(true);
    });
  });

  describe('Zod Schemas Validation', () => {
    it('validates ToolDefinition schema', () => {
      const validTool = {
        name: 'read_file',
        description: 'Reads contents of a file',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' },
          },
          required: ['path'],
        },
      };

      const parsed = ToolDefinitionSchema.parse(validTool);
      expect(parsed.name).toBe('read_file');
    });

    it('validates ToolCall and ToolResult schemas', () => {
      const toolCall = {
        id: 'call_123',
        name: 'write_file',
        arguments: { path: 'test.ts', content: 'export const x = 1;' },
      };
      const parsedCall = ToolCallSchema.parse(toolCall);
      expect(parsedCall.id).toBe('call_123');

      const toolResult = {
        toolCallId: 'call_123',
        toolName: 'write_file',
        output: { success: true, bytesWritten: 24 },
        isError: false,
      };
      const parsedResult = ToolResultSchema.parse(toolResult);
      expect(parsedResult.output).toEqual({ success: true, bytesWritten: 24 });
    });

    it('validates LLMMessage and ProviderConfig schemas', () => {
      const msg = {
        role: 'user',
        content: 'Refactor this module',
      };
      expect(LLMMessageSchema.parse(msg).role).toBe('user');

      const config = {
        providerType: 'OPENROUTER',
        apiKey: 'sk-or-v1-123456',
        defaultModel: 'anthropic/claude-3.5-sonnet',
        timeoutMs: 60000,
      };
      expect(ProviderConfigSchema.parse(config).providerType).toBe('OPENROUTER');
    });
  });

  describe('BaseLLMProvider & MockLLMProvider Execution', () => {
    it('validates request before generating response', async () => {
      const mock = new MockLLMProvider();

      await expect(mock.generate({} as any)).rejects.toThrow(InvalidRequestError);
      await expect(
        mock.generate({ model: 'mock-model', messages: [] } as any),
      ).rejects.toThrow(InvalidRequestError);
    });

    it('generates default mock response and records call history', async () => {
      const mock = new MockLLMProvider('mock:test');
      expect(mock.id).toBe('mock:test');
      expect(mock.providerType).toBe('MOCK');
      expect(mock.supports('supportsToolCalling')).toBe(true);

      const request: LLMRequest = {
        model: 'mock-model',
        messages: [{ role: 'user', content: 'Generate code' }],
      };

      const res = await mock.generate(request);
      expect(res.content).toContain('Generate code');
      expect(res.finishReason).toBe('stop');
      expect(res.usage?.totalTokens).toBe(25);

      const calls = mock.getRecordedCalls();
      expect(calls.length).toBe(1);
      expect(calls[0]?.messages[0]?.content).toBe('Generate code');

      mock.clearRecordedCalls();
      expect(mock.getRecordedCalls().length).toBe(0);
    });

    it('returns canned mock responses sequentially', async () => {
      const mock = new MockLLMProvider();
      const canned: LLMResponse[] = [
        { content: 'Step 1: Planning', finishReason: 'stop' },
        { content: 'Step 2: Coding', finishReason: 'stop' },
      ];
      mock.setMockResponses(canned);

      const res1 = await mock.generate({
        model: 'mock-model',
        messages: [{ role: 'user', content: 'Start' }],
      });
      expect(res1.content).toBe('Step 1: Planning');

      const res2 = await mock.generate({
        model: 'mock-model',
        messages: [{ role: 'user', content: 'Next' }],
      });
      expect(res2.content).toBe('Step 2: Coding');
    });

    it('streams mock response chunks via async generator', async () => {
      const mock = new MockLLMProvider();
      mock.setMockResponses([{ content: 'Hello streaming world', finishReason: 'stop' }]);

      const chunks: string[] = [];
      for await (const chunk of mock.stream({
        model: 'mock-model',
        messages: [{ role: 'user', content: 'Stream test' }],
      })) {
        if (chunk.delta.content) {
          chunks.push(chunk.delta.content);
        }
      }

      expect(chunks.join('')).toBe('Hello streaming world');
    });
  });

  describe('ProviderFactory Registry & Instantiation', () => {
    it('creates default registered MOCK provider', () => {
      const factory = new ProviderFactory();
      expect(factory.has('MOCK')).toBe(true);
      expect(factory.getRegisteredTypes()).toContain('MOCK');

      const provider = factory.create({ providerType: 'MOCK' });
      expect(provider).toBeInstanceOf(MockLLMProvider);
      expect(provider.providerType).toBe('MOCK');
    });

    it('registers custom provider and instantiates it dynamically', () => {
      const factory = new ProviderFactory();

      class CustomTestProvider extends MockLLMProvider {
        constructor(id: string) {
          super(id, { providerType: 'CUSTOM_TEST' });
        }
      }

      factory.register('CUSTOM_TEST', CustomTestProvider);
      expect(factory.has('CUSTOM_TEST')).toBe(true);

      const provider = factory.create({ providerType: 'CUSTOM_TEST' });
      expect(provider).toBeInstanceOf(CustomTestProvider);
    });

    it('caches provider instances when using getOrCreate', () => {
      const factory = new ProviderFactory();
      const config = {
        providerType: 'MOCK',
        defaultModel: 'mock-v1',
      };

      const instance1 = factory.getOrCreate(config);
      const instance2 = factory.getOrCreate(config);

      expect(instance1).toBe(instance2);

      factory.clearCache();
      const instance3 = factory.getOrCreate(config);
      expect(instance3).not.toBe(instance1);
    });

    it('throws InvalidRequestError when creating unknown provider type', () => {
      const factory = new ProviderFactory();
      expect(() =>
        factory.create({ providerType: 'UNKNOWN_PROVIDER' }),
      ).toThrow(InvalidRequestError);
    });

    it('unregisters provider cleanly', () => {
      const factory = new ProviderFactory();
      expect(factory.has('MOCK')).toBe(true);
      const unregistered = factory.unregister('MOCK');
      expect(unregistered).toBe(true);
      expect(factory.has('MOCK')).toBe(false);
    });
  });
});
