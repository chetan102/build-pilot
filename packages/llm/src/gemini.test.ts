import { describe, it, expect, vi } from 'vitest';
import { GeminiProvider } from './gemini.js';
import { LLMRequest } from './types.js';
import { AuthError, RateLimitError } from './errors.js';

describe('Google Gemini Provider Adapter (Task 17.1)', () => {
  it('formats request and parses text response correctly', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: 'Here is the plan for fixing the issue.' }],
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: {
          promptTokenCount: 150,
          candidatesTokenCount: 40,
          totalTokenCount: 190,
        },
      }),
    });

    const provider = new GeminiProvider('gemini:1.5-pro', { apiKey: 'fake_key' }, mockFetch as any);

    const request: LLMRequest = {
      model: 'gemini-1.5-pro',
      messages: [{ role: 'user', content: 'Fix the bug' }],
      systemPrompt: 'You are an autonomous engineer.',
    };

    const res = await provider.generate(request);

    expect(res.content).toBe('Here is the plan for fixing the issue.');
    expect(res.usage?.totalTokens).toBe(190);
    expect(res.finishReason).toBe('stop');
  });

  it('maps function declarations and parses tool call response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: 'read_file',
                    args: { path: 'src/index.ts' },
                  },
                },
              ],
            },
            finishReason: 'STOP',
          },
        ],
      }),
    });

    const provider = new GeminiProvider('gemini:1.5-pro', { apiKey: 'fake_key' }, mockFetch as any);

    const res = await provider.generate({
      model: 'gemini-1.5-pro',
      messages: [{ role: 'user', content: 'Read file' }],
      tools: [
        {
          name: 'read_file',
          description: 'Read file content',
          parameters: {
            type: 'object',
            properties: { path: { type: 'string' } },
          },
        },
      ],
    });

    expect(res.toolCalls).toHaveLength(1);
    expect(res.toolCalls?.[0]?.name).toBe('read_file');
    expect(res.toolCalls?.[0]?.arguments).toEqual({ path: 'src/index.ts' });
  });

  it('normalizes HTTP 401 and 429 errors into AuthError and RateLimitError', async () => {
    const authFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: { message: 'API key not valid' } }),
    });

    const provider = new GeminiProvider('gemini:1.5-pro', { apiKey: 'invalid_key' }, authFetch as any);

    await expect(
      provider.generate({ model: 'gemini-1.5-pro', messages: [{ role: 'user', content: 'Hi' }] }),
    ).rejects.toThrow(AuthError);
  });
});
