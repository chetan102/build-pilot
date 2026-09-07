import { describe, it, expect, vi } from 'vitest';
import { AnthropicProvider } from './anthropic.js';
import { LLMRequest } from './types.js';
import { AuthError, RateLimitError } from './errors.js';

describe('Anthropic Provider Adapter (Task 17.3)', () => {
  it('formats messages API request and parses text response correctly', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Anthropic response to engineering task' }],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 200,
          output_tokens: 50,
        },
      }),
    });

    const provider = new AnthropicProvider('anthropic:claude-3.5', { apiKey: 'fake_key' }, mockFetch as any);

    const request: LLMRequest = {
      model: 'claude-3-5-sonnet-20241022',
      messages: [{ role: 'user', content: 'Fix the bug' }],
      systemPrompt: 'You are an autonomous engineer.',
    };

    const res = await provider.generate(request);

    expect(res.content).toBe('Anthropic response to engineering task');
    expect(res.usage?.totalTokens).toBe(250);
    expect(res.finishReason).toBe('stop');
  });

  it('handles tool_use blocks and parses tool call accurately', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'msg_123',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_01',
            name: 'write_file',
            input: { path: 'src/main.ts', content: 'console.log("hello");' },
          },
        ],
        stop_reason: 'tool_use',
      }),
    });

    const provider = new AnthropicProvider('anthropic:claude-3.5', { apiKey: 'fake_key' }, mockFetch as any);

    const res = await provider.generate({
      model: 'claude-3-5-sonnet-20241022',
      messages: [{ role: 'user', content: 'Write code' }],
      tools: [
        {
          name: 'write_file',
          description: 'Write file content',
          parameters: {
            type: 'object',
            properties: { path: { type: 'string' }, content: { type: 'string' } },
          },
        },
      ],
    });

    expect(res.toolCalls).toHaveLength(1);
    expect(res.toolCalls?.[0]?.id).toBe('toolu_01');
    expect(res.toolCalls?.[0]?.name).toBe('write_file');
    expect(res.toolCalls?.[0]?.arguments).toEqual({ path: 'src/main.ts', content: 'console.log("hello");' });
    expect(res.finishReason).toBe('tool_calls');
  });

  it('normalizes HTTP 401 into AuthError', async () => {
    const authFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: { message: 'Invalid API key' } }),
    });

    const provider = new AnthropicProvider('anthropic:claude-3.5', { apiKey: 'invalid_key' }, authFetch as any);

    await expect(
      provider.generate({ model: 'claude-3-5-sonnet-20241022', messages: [{ role: 'user', content: 'Hi' }] }),
    ).rejects.toThrow(AuthError);
  });
});
