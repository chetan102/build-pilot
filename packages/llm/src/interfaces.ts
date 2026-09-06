import { LLMProviderKind } from '@buildpilot/domain';
import {
  LLMRequest,
  LLMResponse,
  LLMStreamChunk,
  LLMProviderCapabilities,
} from './types.js';

export interface LLMProvider {
  /**
   * Unique identifier for this provider instance (e.g. 'openrouter:default' or 'openai:custom')
   */
  readonly id: string;

  /**
   * Provider kind (e.g. 'OPENROUTER', 'GEMINI', 'OPENAI', 'ANTHROPIC', 'CUSTOM_OPENAI_COMPATIBLE')
   */
  readonly providerType: LLMProviderKind | string;

  /**
   * Generates a complete LLM response (non-streaming)
   */
  generate(request: LLMRequest): Promise<LLMResponse>;

  /**
   * Streams LLM response chunks as they arrive from the provider
   */
  stream(request: LLMRequest): AsyncIterable<LLMStreamChunk>;

  /**
   * Checks if this provider/model supports a specific capability (e.g. 'supportsToolCalling')
   */
  supports(capability: keyof LLMProviderCapabilities, model?: string): boolean;

  /**
   * Returns complete capability map for the provider/model
   */
  getCapabilities(model?: string): LLMProviderCapabilities;

  /**
   * Optional lightweight ping/health check to verify provider credentials and reachability
   */
  validateConnection?(): Promise<boolean>;
}

