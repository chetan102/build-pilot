import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { readFileTool, writeFileTool } from './file-tools.js';
import { listFilesTool, searchCodeTool } from './search-tools.js';
import { gitStatusTool, gitDiffTool } from './git-tools.js';
import { resolveSafePath } from './path-utils.js';
import { ToolContext } from '../types.js';

describe('Repository Tools (Task 7.2)', () => {
  let tempDir: string;
  let context: ToolContext;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bp-repo-tools-'));
    context = {
      workspaceDir: tempDir,
      taskId: 'task_demo',
      runId: 'run_demo',
    };
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('path safety', () => {
    it('prevents path traversal outside of workspaceDir', () => {
      expect(() => resolveSafePath(tempDir, '../../etc/passwd')).toThrow('Path traversal denied');
      expect(resolveSafePath(tempDir, 'src/index.ts')).toBe(path.join(tempDir, 'src/index.ts'));
    });
  });

  describe('write_file & read_file', () => {
    it('creates file with nested directories and reads content back with slicing', async () => {
      const writeRes = await writeFileTool.execute(
        {
          path: 'src/components/Button.tsx',
          content: 'line 1\nline 2\nline 3\nline 4\nline 5',
          createDirectories: true,
        },
        context,
      );

      expect(writeRes.created).toBe(true);
      expect(writeRes.bytesWritten).toBeGreaterThan(0);

      // Read full file
      const fullRead = await readFileTool.execute({ path: 'src/components/Button.tsx', maxLines: 1000 }, context);
      expect(fullRead.totalLines).toBe(5);
      expect(fullRead.content).toBe('line 1\nline 2\nline 3\nline 4\nline 5');
      expect(fullRead.truncated).toBe(false);

      // Read sliced range lines 2 to 4
      const sliceRead = await readFileTool.execute(
        { path: 'src/components/Button.tsx', startLine: 2, endLine: 4, maxLines: 1000 },
        context,
      );
      expect(sliceRead.content).toBe('line 2\nline 3\nline 4');
      expect(sliceRead.startLine).toBe(2);
      expect(sliceRead.endLine).toBe(4);
    });
  });

  describe('list_files', () => {
    it('recursively lists files up to maxDepth', async () => {
      await writeFileTool.execute({ path: 'README.md', content: '# Hello', createDirectories: true }, context);
      await writeFileTool.execute({ path: 'src/index.ts', content: 'console.log(1);', createDirectories: true }, context);
      await writeFileTool.execute({ path: 'src/utils/math.ts', content: 'export const add = 1;', createDirectories: true }, context);

      const res = await listFilesTool.execute({ path: '.', maxDepth: 3, limit: 500, includeHidden: false }, context);
      expect(res.count).toBeGreaterThanOrEqual(3);
      const paths = res.entries.map((e) => e.path);
      expect(paths).toContain('README.md');
      expect(paths).toContain(path.join('src', 'index.ts'));
      expect(paths).toContain(path.join('src', 'utils', 'math.ts'));
    });
  });

  describe('search_code', () => {
    it('searches for text patterns and regular expressions across workspace', async () => {
      await writeFileTool.execute(
        {
          path: 'src/auth.ts',
          content: 'function authenticate() {\n  const token = "secret_jwt";\n  return token;\n}',
          createDirectories: true,
        },
        context,
      );
      await writeFileTool.execute(
        {
          path: 'src/user.ts',
          content: 'export interface User {\n  id: string;\n  name: string;\n}',
          createDirectories: true,
        },
        context,
      );

      const searchRes = await searchCodeTool.execute({ query: 'secret_jwt', path: '.', isRegex: false, caseSensitive: false, maxResults: 100 }, context);
      expect(searchRes.count).toBe(1);
      const match1 = searchRes.matches[0];
      expect(match1).toBeDefined();
      if (match1) {
        expect(match1.file).toBe(path.join('src', 'auth.ts'));
        expect(match1.lineNumber).toBe(2);
        expect(match1.lineContent).toContain('const token = "secret_jwt"');
      }

      // Regex search
      const regexRes = await searchCodeTool.execute({ query: 'interface\\s+User', path: '.', isRegex: true, caseSensitive: false, maxResults: 100 }, context);
      expect(regexRes.count).toBe(1);
      const match2 = regexRes.matches[0];
      expect(match2).toBeDefined();
      if (match2) {
        expect(match2.file).toBe(path.join('src', 'user.ts'));
      }
    });
  });

  describe('git tools', () => {
    it('runs git_status and git_diff without crashing on repository workspace', async () => {
      const statusRes = await gitStatusTool.execute({ path: '.' }, { ...context, workspaceDir: process.cwd() });
      expect(typeof statusRes.clean).toBe('boolean');
      expect(Array.isArray(statusRes.files)).toBe(true);

      const diffRes = await gitDiffTool.execute({ staged: false, maxLines: 1000 }, { ...context, workspaceDir: process.cwd() });
      expect(typeof diffRes.diff).toBe('string');
      expect(typeof diffRes.totalLines).toBe('number');
    });
  });
});
