import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { GitRepositoryManager } from './repository-manager.js';
import { GitWorktreeManager } from './worktree-manager.js';
import { GitCommitPushService } from './commit-push-service.js';

const execFileAsync = promisify(execFile);

describe('Git Workspace Management (Phase 8)', () => {
  let testRoot: string;
  let originDir: string;
  let mirrorDir: string;

  beforeEach(async () => {
    testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'bp-git-test-'));
    originDir = path.join(testRoot, 'origin-repo');
    mirrorDir = path.join(testRoot, 'mirror-repo');

    // Initialize mock origin repository with initial commit
    await fs.mkdir(originDir, { recursive: true });
    await execFileAsync('git', ['init', '-b', 'main'], { cwd: originDir });
    await execFileAsync('git', ['config', 'user.name', 'Test User'], { cwd: originDir });
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: originDir });
    await fs.writeFile(path.join(originDir, 'README.md'), '# Main Repo', 'utf-8');
    await execFileAsync('git', ['add', '-A'], { cwd: originDir });
    await execFileAsync('git', ['commit', '-m', 'Initial commit'], { cwd: originDir });
  });

  afterEach(async () => {
    try {
      await fs.rm(testRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('Task 8.1 — Repository Preparation', () => {
    it('clones and fetches clean repository mirror', async () => {
      const repoManager = new GitRepositoryManager();

      // First call: Clone
      const cloneRes = await repoManager.cloneOrFetch({
        repoUrl: originDir,
        targetDir: mirrorDir,
        defaultBranch: 'main',
      });

      expect(cloneRes.cloned).toBe(true);
      expect(cloneRes.fetched).toBe(false);
      expect(cloneRes.repoDir).toBe(mirrorDir);

      // Verify file exists in mirror
      const readme = await fs.readFile(path.join(mirrorDir, 'README.md'), 'utf-8');
      expect(readme).toContain('# Main Repo');

      // Second call: Fetch
      const fetchRes = await repoManager.cloneOrFetch({
        repoUrl: originDir,
        targetDir: mirrorDir,
        defaultBranch: 'main',
      });
      expect(fetchRes.cloned).toBe(false);
      expect(fetchRes.fetched).toBe(true);
    });
  });

  describe('Task 8.2 — Isolated Worktree Management', () => {
    it('creates dedicated task worktree and cleans it up after execution', async () => {
      const repoManager = new GitRepositoryManager();
      await repoManager.cloneOrFetch({
        repoUrl: originDir,
        targetDir: mirrorDir,
        defaultBranch: 'main',
      });

      const worktreeManager = new GitWorktreeManager();
      const worktreeInfo = await worktreeManager.createWorktree({
        repoDir: mirrorDir,
        taskId: '6a9cf1f85d9b845db6781a0b',
        runId: '6a9cf2425d9b845db6781a18',
        baseBranch: 'main',
      });

      expect(worktreeInfo.branch).toBe('buildpilot/task-b6781a0b-781a18');
      expect(worktreeInfo.baseBranch).toBe('main');

      // Verify worktree file system isolated existence
      const worktreeReadme = await fs.readFile(
        path.join(worktreeInfo.worktreePath, 'README.md'),
        'utf-8',
      );
      expect(worktreeReadme).toContain('# Main Repo');

      // Check list worktrees
      const list = await worktreeManager.listWorktrees(mirrorDir);
      expect(list.some((p) => p.includes('6a9cf1f85d9b845db6781a0b'))).toBe(true);

      // Clean up worktree
      await worktreeManager.removeWorktree(mirrorDir, worktreeInfo.worktreePath);
      const postCleanupList = await worktreeManager.listWorktrees(mirrorDir);
      expect(postCleanupList.some((p) => p.includes('6a9cf1f85d9b845db6781a0b'))).toBe(false);
    });
  });

  describe('Task 8.3 — Commit & Push Flow', () => {
    it('creates structured task commit and verifies diff', async () => {
      const repoManager = new GitRepositoryManager();
      await repoManager.cloneOrFetch({
        repoUrl: originDir,
        targetDir: mirrorDir,
        defaultBranch: 'main',
      });

      const worktreeManager = new GitWorktreeManager();
      const worktreeInfo = await worktreeManager.createWorktree({
        repoDir: mirrorDir,
        taskId: 'task_100',
        runId: 'run_100',
        baseBranch: 'main',
      });

      // Modify a file in the worktree
      await fs.writeFile(
        path.join(worktreeInfo.worktreePath, 'new-feature.ts'),
        'export const feature = true;',
        'utf-8',
      );

      const commitService = new GitCommitPushService();
      const commitRes = await commitService.createCommit({
        worktreePath: worktreeInfo.worktreePath,
        message: 'Implement user feature',
        taskId: 'task_100',
        issueNumber: 42,
      });

      expect(commitRes.commitSha).toHaveLength(40);
      expect(commitRes.filesChanged).toContain('new-feature.ts');
      expect(commitRes.message).toContain('Implement user feature (fixes #42)');
      expect(commitRes.message).toContain('Task-ID: task_100');

      // Clean up
      await worktreeManager.removeWorktree(mirrorDir, worktreeInfo.worktreePath);
    });
  });
});
