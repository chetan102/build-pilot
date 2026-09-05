import { describe, it, expect } from 'vitest';
import type { LLMRequest, LLMResponse } from './index.js';

describe('llm package', () => {
  it('types compile properly', () => {
    const req: LLMRequest = {
      messages: [{ role: 'user', content: 'hello' }],
    };
    const res: LLMResponse = {
      content: 'world',
    };
    expect(req.messages[0]?.content).toBe('hello');
    expect(res.content).toBe('world');
  });
});
