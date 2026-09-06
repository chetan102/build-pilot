import { z } from 'zod';
import { LLMProviderType, LLMProviderKind } from '@buildpilot/domain';

export type LLMMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  rawArguments?: string;
}

export interface ToolResult {
  toolCallId: string;
  toolName?: string;
  output: unknown;
  isError?: boolean;
}

export interface LLMMessage {
  role: LLMMessageRole;
  content: string | null;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
    [key: string]: unknown;
  };
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd?: number;
}

export type LLMFinishReason =
  | 'stop'
  | 'tool_calls'
  | 'length'
  | 'content_filter'
  | 'error'
  | 'other';

export interface LLMRequest {
  model: string;
  messages: LLMMessage[];
  systemPrompt?: string;
  tools?: ToolDefinition[];
  toolChoice?:
    | 'auto'
    | 'none'
    | 'required'
    | { type: 'function'; function: { name: string } };
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
  timeoutMs?: number;
  metadata?: Record<string, unknown>;
}

export interface LLMResponse {
  content: string | null;
  toolCalls?: ToolCall[];
  finishReason?: LLMFinishReason;
  usage?: TokenUsage;
  model?: string;
  rawResponse?: unknown;
}

export interface ToolCallDelta {
  index: number;
  id?: string;
  name?: string;
  argumentsDelta?: string;
}

export interface LLMStreamChunk {
  delta: {
    content?: string;
    toolCalls?: ToolCallDelta[];
  };
  finishReason?: LLMFinishReason;
  usage?: TokenUsage;
  model?: string;
}

export interface LLMProviderCapabilities {
  supportsStreaming: boolean;
  supportsToolCalling: boolean;
  supportsVision: boolean;
  supportsSystemPrompt: boolean;
  maxContextTokens?: number;
}

export interface ProviderConfig {
  providerType: LLMProviderKind | string;
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  organizationId?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxRetries?: number;
}

// Zod Schemas for validation
export const ToolDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  parameters: z.object({
    type: z.literal('object'),
    properties: z.record(z.unknown()).optional(),
    required: z.array(z.string()).optional(),
  }).passthrough(),
});

export const ToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.record(z.unknown()),
  rawArguments: z.string().optional(),
});

export const ToolResultSchema = z.object({
  toolCallId: z.string(),
  toolName: z.string().optional(),
  output: z.unknown(),
  isError: z.boolean().optional(),
});

export const LLMMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string().nullable(),
  name: z.string().optional(),
  toolCallId: z.string().optional(),
  toolCalls: z.array(ToolCallSchema).optional(),
});

export const TokenUsageSchema = z.object({
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
  costUsd: z.number().optional(),
});

export const ProviderConfigSchema = z.object({
  providerType: z.string().min(1),
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
  defaultModel: z.string().optional(),
  organizationId: z.string().optional(),
  headers: z.record(z.string()).optional(),
  timeoutMs: z.number().int().positive().optional(),
  maxRetries: z.number().int().nonnegative().optional(),
});

