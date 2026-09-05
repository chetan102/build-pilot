import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ToolRegistry } from './index.js';
import { ToolPermissionClass } from '@buildpilot/domain';

describe('tools package', () => {
  it('registers and retrieves tools', () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'test_tool',
      description: 'A test tool',
      permissionClass: ToolPermissionClass.READ_ONLY,
      inputSchema: z.object({}),
      execute: async () => ({ ok: true }),
    });

    expect(registry.get('test_tool')?.name).toBe('test_tool');
    expect(registry.list().length).toBe(1);
  });
});

