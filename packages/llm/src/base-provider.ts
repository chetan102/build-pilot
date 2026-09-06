import { LLMProviderKind } from '@buildpilot/domain';
import { LLMProvider } from './interfaces.js';
import {
  LLMRequest,
  LLMResponse,
  LLMStreamChunk,
  LLMProviderCapabilities,
  ProviderConfig,
} from './types.js';
import { InvalidRequestError } from './errors.js';

export abstract class BaseLLMProvider implements LLMProvider {
  public readonly id: string;
  public readonly providerType: LLMProviderKind | string;
  protected config: ProviderConfig;

  constructor(id: string, providerType: LLMProviderKind | string, config: ProviderConfig) {
    this.id = id;
    this.providerType = providerType;
    this.config = config;
  }

  abstract generate(request: LLMRequest): Promise<LLMResponse>;
  abstract stream(request: LLMRequest): AsyncIterable<LLMStreamChunk>;

  supports(capability: keyof LLMProviderCapabilities, model?: string): boolean {
    const caps = this.getCapabilities(model);
    return Boolean(caps[capability]);
  }

  getCapabilities(_model?: string): LLMProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsToolCalling: true,
      supportsVision: false,
      supportsSystemPrompt: true,
      maxContextTokens: 128000,
    };
  }

  protected validateRequest(request: LLMRequest): void {
    if (!request) {
      throw new InvalidRequestError('LLMRequest cannot be null or undefined', {
        provider: this.providerType,
      });
    }
    if (!request.model) {
      throw new InvalidRequestError('Model is required in LLMRequest', {
        provider: this.providerType,
        param: 'model',
      });
    }
    if (!Array.isArray(request.messages) || request.messages.length === 0) {
      throw new InvalidRequestError('Messages array must contain at least one message', {
        provider: this.providerType,
        param: 'messages',
      });
    }
  }
}

/**
 * Mock Provider for offline execution, unit tests, and CI/CD without API keys
 */
export class MockLLMProvider extends BaseLLMProvider {
  private cannedResponses: LLMResponse[] = [];
  private calls: LLMRequest[] = [];

  constructor(
    id = 'mock:default',
    config: ProviderConfig = { providerType: 'MOCK' },
  ) {
    super(id, 'MOCK', config);
  }

  setMockResponses(responses: LLMResponse[]): void {
    this.cannedResponses = [...responses];
  }

  getRecordedCalls(): LLMRequest[] {
    return this.calls;
  }

  clearRecordedCalls(): void {
    this.calls = [];
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    this.validateRequest(request);
    this.calls.push(request);

    if (this.cannedResponses.length > 0) {
      return this.cannedResponses.shift()!;
    }

    // Default mock response
    return {
      content: `Mock response for prompt: ${request.messages[request.messages.length - 1]?.content || ''}`,
      finishReason: 'stop',
      model: request.model,
      usage: {
        promptTokens: 10,
        completionTokens: 15,
        totalTokens: 25,
      },
    };
  }

  async *stream(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    this.validateRequest(request);
    this.calls.push(request);

    const fullResponse = await this.generate(request);
    const text = fullResponse.content || '';
    const words = text.split(' ');

    for (let i = 0; i < words.length; i++) {
      yield {
        delta: {
          content: (i === 0 ? '' : ' ') + words[i],
        },
        model: request.model,
      };
    }

    yield {
      delta: {},
      finishReason: fullResponse.finishReason || 'stop',
      usage: fullResponse.usage,
      model: request.model,
    };
  }
}

