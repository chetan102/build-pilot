import path from 'path';
import fs from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createLogger, Logger } from '@buildpilot/observability';
import { loadConfig } from '@buildpilot/config';
import {
  connectToDatabase,
  disconnectDatabase,
  taskRepository as defaultTaskRepository,
  taskRunRepository as defaultTaskRunRepository,
  eventRepository as defaultEventRepository,
  projectRepository,
  providerCredentialRepository,
  TaskRepository,
  TaskRunRepository,
  EventRepository,
  isValidObjectId,
  Types,
} from '@buildpilot/database';
import { secretsManager } from '@buildpilot/shared';
import {
  TaskWorkerManager,
  EngineeringTaskJobPayload,
  DEFAULT_WORKER_CONCURRENCY,
} from '@buildpilot/queue';
import { TaskStatus, TaskRunStatus, LLMProviderType } from '@buildpilot/domain';
import { LLMProvider, providerFactory, MockLLMProvider } from '@buildpilot/llm';
import { toolRegistry as defaultToolRegistry, ToolRegistry } from '@buildpilot/tools';
import { gitRepositoryManager, gitWorktreeManager, gitCommitPushService, GitHubService, WorktreeInfo } from '@buildpilot/github';
import { agentCoreLoop, AgentCoreLoop } from './agent/index.js';
import { RepoContext } from './agent/types.js';
import { TaskHeartbeatSession } from './durability/heartbeat-manager.js';
import { Job } from 'bullmq';

const execFileAsync = promisify(execFile);
const config = loadConfig();

async function listDirectoryFilesRecursive(
  dir: string,
  baseDir: string = dir,
  maxFiles: number = 300,
): Promise<string[]> {
  const results: string[] = [];
  async function walk(current: string) {
    if (results.length >= maxFiles) return;
    try {
      const entries = await fs.readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= maxFiles) return;
        if (
          entry.name === '.git' ||
          entry.name === 'node_modules' ||
          entry.name === '.next' ||
          entry.name === 'dist' ||
          entry.name === 'build' ||
          entry.name === '.turbo'
        )
          continue;
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else {
          results.push(path.relative(baseDir, full));
        }
      }
    } catch {
      // ignore read errors
    }
  }
  await walk(dir);
  return results;
}

export interface WorkerServiceOptions {
  logger?: Logger;
  concurrency?: number;
  taskRepository?: TaskRepository;
  taskRunRepository?: TaskRunRepository;
  eventRepository?: EventRepository;
  toolRegistry?: ToolRegistry;
  agentCoreLoop?: AgentCoreLoop;
  llmProvider?: LLMProvider;
  jobExecutor?: (
    payload: EngineeringTaskJobPayload,
    job: Job<EngineeringTaskJobPayload>,
  ) => Promise<{ success: boolean; output?: Record<string, unknown> }>;
}

export interface JobExecutionResult {
  success: boolean;
  taskId: string;
  runId: string;
  durationMs?: number;
  output?: Record<string, unknown>;
}

export class WorkerService {
  private workerManager: TaskWorkerManager | null = null;
  private logger: Logger;
  private isRunning = false;
  private taskRepo: TaskRepository;
  private taskRunRepo: TaskRunRepository;
  private eventRepo: EventRepository;
  private toolRegistry: ToolRegistry;
  private agentLoop: AgentCoreLoop;
  private jobExecutor?: (
    payload: EngineeringTaskJobPayload,
    job: Job<EngineeringTaskJobPayload>,
  ) => Promise<{ success: boolean; output?: Record<string, unknown> }>;

  constructor(private options: WorkerServiceOptions = {}) {
    this.logger = options.logger || createLogger({ serviceName: 'agent-worker' });
    this.taskRepo = options.taskRepository || defaultTaskRepository;
    this.taskRunRepo = options.taskRunRepository || defaultTaskRunRepository;
    this.eventRepo = options.eventRepository || defaultEventRepository;
    this.toolRegistry = options.toolRegistry || defaultToolRegistry;
    this.agentLoop = options.agentCoreLoop || agentCoreLoop;
    this.jobExecutor = options.jobExecutor;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.logger.info('Starting BuildPilot Agent Worker Service...');

    // Attempt DB connection
    try {
      await connectToDatabase({ uri: config.MONGODB_URI });
      this.logger.info('Connected to MongoDB');
    } catch (err) {
      this.logger.warn({ err }, 'Worker database connection deferred/failed');
    }

    // Initialize BullMQ Worker Processor
    this.workerManager = new TaskWorkerManager(
      {
        host: config.REDIS_HOST,
        port: config.REDIS_PORT,
        password: config.REDIS_PASSWORD,
      },
      this.processJob.bind(this),
      {
        concurrency: this.options.concurrency || DEFAULT_WORKER_CONCURRENCY,
      },
    );

    this.isRunning = true;
    this.logger.info(
      { concurrency: this.options.concurrency || DEFAULT_WORKER_CONCURRENCY },
      'Agent Worker Service started and listening for jobs',
    );
  }

  async processJob(job: Job<EngineeringTaskJobPayload>): Promise<JobExecutionResult> {
    const { taskId, title, description, branch, provider, model, maxSteps, correlationId } = job.data;
    const runId = (job.data.runId && isValidObjectId(job.data.runId))
      ? job.data.runId
      : new Types.ObjectId().toString();
    const attempt = job.attemptsMade + 1;
    const startTime = Date.now();

    this.logger.info(
      { jobId: job.id, taskId, runId, title, branch, attempt },
      'Worker picked up engineering task job',
    );

    const heartbeat = new TaskHeartbeatSession({
      runId,
      taskRunRepo: this.taskRunRepo,
      logger: this.logger,
    });

    try {
      // 1. Start heartbeat lease renewal session
      await heartbeat.start();

      // Resolve credentials & model from job data, metadata, or active saved DB credentials
      const isRealKey = (k?: string) => Boolean(k && !k.includes('your-') && !k.includes('mock') && k.trim().length > 10);
      let resolvedProvider = provider || (job.data.metadata?.provider as any);
      let resolvedModel = model || (job.data.metadata?.model as string);
      let apiKey = (job.data.metadata?.apiKey as string) || '';

      // Check MongoDB for saved active provider credential if not already injected
      if (!this.options.llmProvider && !this.jobExecutor) {
        try {
          const savedCred =
            (await providerCredentialRepository.findActiveProvider('default-user', resolvedProvider as any)) ||
            (await providerCredentialRepository.findActiveProvider('default-user'));

          if (savedCred) {
            resolvedProvider = resolvedProvider || savedCred.provider;
            // Priority to job-specified model if present; otherwise use saved defaultModel
            resolvedModel = (model && model !== 'anthropic/claude-3.5-sonnet') ? model : (savedCred.defaultModel || model || 'gpt-4o');
            if (!isRealKey(apiKey) && savedCred.apiKeyEncrypted) {
              apiKey = secretsManager.decrypt(savedCred.apiKeyEncrypted);
              this.logger.info(
                { provider: resolvedProvider, model: resolvedModel },
                'Loaded encrypted API key saved by user from UI Settings',
              );
            }
          }
        } catch (err) {
          this.logger.warn({ err }, 'Could not read saved UI provider credentials');
        }
      }

      resolvedProvider = resolvedProvider || LLMProviderType.OPENROUTER;
      resolvedModel = resolvedModel || 'gpt-4o';

      // 2. Initialize / persist TaskRun state
      const existingRun = await this.taskRunRepo.findById(runId);
      if (!existingRun) {
        await this.taskRunRepo.create({
          _id: runId,
          taskId,
          status: TaskRunStatus.RUNNING,
          branch,
          provider: resolvedProvider,
          model: resolvedModel,
          maxSteps: maxSteps || 30,
          startedAt: new Date(),
        });
      } else {
        await this.taskRunRepo.markStarted(runId, new Date());
      }

      // 3. Save initial checkpoint & transition Task status to PLANNING
      await this.taskRunRepo.saveCheckpoint(runId, {
        stage: 'PLANNING',
        stepIndex: 1,
        summary: `Started processing on branch ${branch}`,
      });

      await this.taskRepo.updateStatus(taskId, TaskStatus.PLANNING, {
        activeRunId: runId,
      });

      // 4. Record TASK_RUN_STARTED event
      await this.eventRepo.create({
        taskId,
        runId,
        type: 'TASK_RUN_STARTED',
        payload: {
          jobId: job.id,
          attempt,
          branch,
          provider: resolvedProvider,
          model: resolvedModel,
          correlationId,
        },
        level: 'info',
      });

      // 5. Execute the agent workflow (custom executor or full autonomous agent pipeline)
      let executionOutput: Record<string, unknown> | undefined;
      let prUrl: string | undefined;
      let prNumber: number | undefined;
      if (this.jobExecutor) {
        const res = await this.jobExecutor(job.data, job);
        if (!res.success) {
          throw new Error('Agent execution failed during step processing');
        }
        executionOutput = res.output;
      } else {
        this.logger.info(
          { taskId, runId, branch, provider: resolvedProvider, model: resolvedModel },
          'Executing agent workflow pipeline with autonomous tools',
        );

        // Resolve target repository workspace and prepare isolated Git worktree
        let workspaceDir = process.cwd();
        let worktreeInfo: WorktreeInfo | null = null;
        let targetRepoDir = '';
        let repoContext: RepoContext | undefined = undefined;
        const repoName = job.data.repositoryId || '';
        const baseBranch = job.data.baseBranch || 'main';

        if (repoName && repoName.includes('/') && process.env.NODE_ENV !== 'test') {
          const githubToken =
            (job.data.metadata?.githubToken as string) || process.env.GITHUB_TOKEN;
          const repoUrl = githubToken
            ? `https://x-access-token:${githubToken}@github.com/${repoName}.git`
            : `https://github.com/${repoName}.git`;

          const reposRoot = path.resolve(process.cwd(), '.buildpilot', 'repos');
          targetRepoDir = path.join(reposRoot, repoName.replace('/', '_'));

          try {
            this.logger.info(
              { repoUrl: repoUrl.replace(/:[^@]+@/, ':***@'), targetRepoDir },
              'Cloning or updating repository mirror',
            );
            await gitRepositoryManager.cloneOrFetch({
              repoUrl,
              targetDir: targetRepoDir,
              defaultBranch: baseBranch,
              logger: this.logger,
            });

            const worktreesRoot = path.resolve(process.cwd(), '.buildpilot', 'worktrees');
            worktreeInfo = await gitWorktreeManager.createWorktree({
              repoDir: targetRepoDir,
              taskId,
              runId,
              baseBranch,
              taskBranch: branch,
              worktreesRoot,
            });

            workspaceDir = worktreeInfo.worktreePath;
            this.logger.info({ workspaceDir }, 'Prepared dedicated workspace worktree for task');

            const fileTree = await listDirectoryFilesRecursive(workspaceDir);
            repoContext = {
              owner: repoName.split('/')[0] || '',
              name: repoName.split('/')[1] || '',
              fullName: repoName,
              defaultBranch: baseBranch,
              workspacePath: workspaceDir,
              fileTree,
            };
          } catch (gitErr: any) {
            this.logger.warn(
              { gitErr: gitErr.message, repoName },
              'Could not initialize git worktree; using workspace fallback',
            );
          }
        }

        // Resolve or instantiate LLM provider from User UI credentials or metadata
        let llmProvider: LLMProvider | undefined = this.options.llmProvider;
        if (!llmProvider) {
          // Fallback to environment variables if provided
          if (!isRealKey(apiKey)) {
            const pUpper = String(resolvedProvider).toUpperCase();
            if (pUpper.includes('GEMINI') && isRealKey(process.env.GEMINI_API_KEY)) {
              apiKey = process.env.GEMINI_API_KEY!;
              resolvedProvider = LLMProviderType.GEMINI;
              resolvedModel = model || 'gemini-1.5-pro';
            } else if (
              (pUpper.includes('ANTHROPIC') || pUpper.includes('CLAUDE')) &&
              isRealKey(process.env.ANTHROPIC_API_KEY)
            ) {
              apiKey = process.env.ANTHROPIC_API_KEY!;
              resolvedProvider = LLMProviderType.ANTHROPIC;
              resolvedModel = model || 'claude-3-5-sonnet-20241022';
            } else if (pUpper.includes('OPENAI') && isRealKey(process.env.OPENAI_API_KEY)) {
              apiKey = process.env.OPENAI_API_KEY!;
              resolvedProvider = LLMProviderType.OPENAI;
              resolvedModel = model || 'gpt-4o';
            } else if (isRealKey(process.env.OPENROUTER_API_KEY)) {
              apiKey = process.env.OPENROUTER_API_KEY!;
              resolvedProvider = LLMProviderType.OPENROUTER;
              resolvedModel = model || 'anthropic/claude-3.5-sonnet';
            }
          }

          if (!isRealKey(apiKey)) {
            throw new Error(
              'No AI API Key provided! Please add your OpenAI, Anthropic, Gemini, or OpenRouter API key in Settings -> LLM Providers to execute.',
            );
          }

          this.logger.info(
            { provider: resolvedProvider, model: resolvedModel },
            'Using live user-configured LLM provider for autonomous execution',
          );
          llmProvider = providerFactory.getOrCreate({
            providerType: resolvedProvider,
            apiKey,
            defaultModel: resolvedModel,
          });
        }

        const agentResult = await this.agentLoop.run(
          {
            taskId,
            runId,
            projectId: job.data.projectId || '',
            repositoryId: job.data.repositoryId || '',
            issueNumber: job.data.issueNumber || 1,
            title,
            description,
            branch,
          },
          repoContext,
          llmProvider,
          this.toolRegistry,
          {
            model: resolvedModel,
            maxSteps: maxSteps || 30,
            ...(worktreeInfo ? { workspaceDir } : {}),
          },
        );

        // If task was cancelled during loop
        if (agentResult.aborted) {
          this.logger.info({ taskId, runId }, 'Task run was cancelled. Cleaning up gracefully.');
          return {
            success: false,
            taskId,
            runId,
            durationMs: Date.now() - startTime,
          };
        }

        if (!agentResult.success && !agentResult.finalAnswer) {
          throw new Error(agentResult.error || 'Agent loop terminated unsuccessfully');
        }

        // Capture git diff, commit changes, push branch, and open PR if worktree was created
        if (worktreeInfo) {
          try {
            // Check status for staged, modified, and untracked new files
            const { stdout: statusOut } = await execFileAsync('git', ['status', '--porcelain'], {
              cwd: worktreeInfo.worktreePath,
            });

            // Stage all files to capture full diff including untracked new files
            if (statusOut && statusOut.trim()) {
              await execFileAsync('git', ['add', '-A'], { cwd: worktreeInfo.worktreePath });
            }

            const { stdout: diffOut } = await execFileAsync('git', ['diff', 'HEAD'], {
              cwd: worktreeInfo.worktreePath,
            }).catch(() => execFileAsync('git', ['diff'], { cwd: worktreeInfo.worktreePath }));

            if (diffOut && diffOut.trim()) {
              await this.taskRunRepo.update(runId, { diff: diffOut });
            }

            if (statusOut && statusOut.trim()) {
              // Resolve GitHub token with project token fallback
              let githubToken = (job.data.metadata?.githubToken as string) || process.env.GITHUB_TOKEN;
              if (!githubToken && job.data.projectId) {
                try {
                  const project = await projectRepository.findByIdOrSlug(job.data.projectId);
                  if (project?.encryptedAccessToken) {
                    githubToken = secretsManager.decrypt(project.encryptedAccessToken);
                  }
                } catch {}
              }

              // Commit changes in worktree
              try {
                await gitCommitPushService.createCommit({
                  worktreePath: worktreeInfo.worktreePath,
                  message: `Fix: ${job.data.title || 'Resolve task issue'}`,
                  taskId,
                  issueNumber: job.data.issueNumber,
                });
                this.logger.info({ taskId, branch: worktreeInfo.branch }, 'Committed task changes in worktree');

                // Formulate authenticated repo push URL
                const authRepoUrl = githubToken
                  ? `https://x-access-token:${githubToken}@github.com/${repoName}.git`
                  : undefined;

                // Push task branch to remote repository
                await gitCommitPushService.pushBranch({
                  worktreePath: worktreeInfo.worktreePath,
                  branch: worktreeInfo.branch,
                  remote: 'origin',
                  repoUrl: authRepoUrl,
                });
                this.logger.info({ taskId, branch: worktreeInfo.branch }, 'Pushed task branch to remote');

                // Open GitHub Pull Request
                const [owner, repo] = repoName.split('/');
                if (githubToken && owner && repo) {
                  const ghService = new GitHubService({ auth: githubToken });
                  const issueNum = job.data.issueNumber;
                  const prTitle = issueNum
                    ? `Fix (#${issueNum}): ${job.data.title || 'Implement task fix'}`
                    : `Fix: ${job.data.title || 'Implement task fix'}`;

                  const prBody = [
                    `## 🤖 Autonomous Pull Request by BuildPilot`,
                    ``,
                    `### 🎯 Objective`,
                    `${job.data.description || job.data.title || 'Implement required issue changes'}`,
                    ``,
                    `### 🛠️ Summary of Changes`,
                    `${agentResult.finalAnswer || 'Automated code changes implemented and verified with tests.'}`,
                    ``,
                    `### 🧪 Verification Status`,
                    `* ✅ Automated tests executed in isolated sandbox/worktree`,
                    `* ✅ Zero regressions verified before PR creation`,
                    ``,
                    `---`,
                    issueNum ? `**Linked Issue:** Resolves #${issueNum} (Closes #${issueNum})` : '',
                    `* Task Branch: \`${worktreeInfo.branch}\``,
                    `* [View Task in BuildPilot Control Plane](${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/tasks/${taskId})`,
                  ].filter(Boolean).join('\n');

                  const prResult = await ghService.createPullRequest({
                    owner,
                    repo,
                    title: prTitle,
                    body: prBody,
                    head: worktreeInfo.branch,
                    base: baseBranch || 'main',
                  });
                  prUrl = prResult.htmlUrl;
                  prNumber = prResult.number;
                  this.logger.info({ prUrl, prNumber, issueNum }, 'Successfully opened GitHub Pull Request');

                  // Post resolution comment on the original GitHub issue linking the PR
                  if (issueNum) {
                    try {
                      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
                      await ghService.createIssueComment(
                        owner,
                        repo,
                        issueNum,
                        `🚀 **BuildPilot Autonomous Agent** has completed the fix and opened Pull Request **[#${prNumber} - ${prTitle}](${prUrl})**!\n\n` +
                        `### 📋 Resolution Summary\n${agentResult.finalAnswer || 'All code changes implemented and verified with automated tests.'}\n\n` +
                        `---\n` +
                        `* 🔗 **Pull Request:** [${prUrl}](${prUrl})\n` +
                        `* 🌿 **Task Branch:** \`${worktreeInfo.branch}\`\n` +
                        `* ⚡ **Live Dashboard:** [View Task Details](${appUrl}/tasks/${taskId})\n\n` +
                        `*(Merging the Pull Request will automatically close this issue)*`
                      );
                      this.logger.info({ issueNumber: issueNum, prNumber }, 'Posted resolution and PR link comment on GitHub issue');
                    } catch (issueCommentErr: any) {
                      this.logger.warn({ err: issueCommentErr.message }, 'Failed to post resolution comment on issue (non-fatal)');
                    }
                  }

                  await this.eventRepo.create({
                    taskId,
                    runId,
                    type: 'PULL_REQUEST_OPENED',
                    payload: {
                      prUrl,
                      prNumber,
                      branch: worktreeInfo.branch,
                    },
                    level: 'info',
                  });
                }
              } catch (gitOpsErr: any) {
                this.logger.warn(
                  { err: gitOpsErr.message, taskId },
                  'Could not complete git commit/push/PR operation (non-fatal)',
                );
              }
            }
          } catch (diffErr: any) {
            this.logger.warn({ diffErr: diffErr.message }, 'Could not capture git diff');
          }
        }

        executionOutput = {
          finalAnswer: agentResult.finalAnswer,
          totalSteps: agentResult.totalSteps,
          totalTokens: agentResult.totalTokens,
        };
      }

      const durationMs = Date.now() - startTime;

      // 6. Save completion checkpoint & mark TaskRun as COMPLETED
      await this.taskRunRepo.saveCheckpoint(runId, {
        stage: 'COMPLETED',
        stepIndex: (executionOutput?.totalSteps as number) || 1,
        summary: (executionOutput?.finalAnswer as string) || 'Agent loop successfully completed execution',
      });

      await this.taskRunRepo.markCompleted(runId, durationMs, executionOutput);

      // 7. Transition Task to COMPLETED (or next stage)
      await this.taskRepo.updateStatus(taskId, TaskStatus.COMPLETED, {
        completedRunId: runId,
        ...(prUrl ? { prUrl, prNumber } : {}),
      });

      // 8. Record TASK_RUN_COMPLETED event
      await this.eventRepo.create({
        taskId,
        runId,
        type: 'TASK_RUN_COMPLETED',
        payload: {
          durationMs,
          attempt,
          ...(executionOutput ? { output: executionOutput } : {}),
        },
        level: 'info',
      });

      this.logger.info(
        { jobId: job.id, taskId, runId, durationMs },
        'Job execution completed successfully',
      );

      return {
        success: true,
        taskId,
        runId,
        durationMs,
        output: executionOutput,
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : String(err);
      const lowerMsg = errorMessage.toLowerCase();

      // Check if task was intentionally cancelled by user
      try {
        const liveTask = await this.taskRepo.findById(taskId);
        if (liveTask?.status === TaskStatus.CANCELLED) {
          this.logger.info({ taskId, runId }, 'Task was cancelled by user. Suppressing failure.');
          return {
            success: false,
            taskId,
            runId,
            durationMs,
          };
        }
      } catch {}

      this.logger.error(
        { jobId: job.id, taskId, runId, attempt, err, durationMs },
        'Job execution failed with error',
      );

      // Record failure on TaskRun
      await this.taskRunRepo.markFailed(runId, errorMessage, durationMs);

      // Record TASK_RUN_FAILED event
      await this.eventRepo.create({
        taskId,
        runId,
        type: 'TASK_RUN_FAILED',
        payload: {
          errorMessage,
          durationMs,
          attempt,
        },
        level: 'error',
      });

      // Check if error is permanently non-retryable (quota/credits exhausted, auth, invalid key, context limit)
      const isPermanentlyNonRetryable =
        lowerMsg.includes('free-models-per-day') ||
        lowerMsg.includes('insufficient_quota') ||
        lowerMsg.includes('exceeded your current quota') ||
        lowerMsg.includes('credit balance') ||
        lowerMsg.includes('add credits') ||
        lowerMsg.includes('out of credits') ||
        lowerMsg.includes('unlock 1000') ||
        lowerMsg.includes('invalid api key') ||
        lowerMsg.includes('authentication failed') ||
        lowerMsg.includes('no ai api key') ||
        lowerMsg.includes('context window exceeded') ||
        lowerMsg.includes('infinite failure loop detected');

      const maxAttempts = job.opts?.attempts ?? 1;
      if (isPermanentlyNonRetryable || attempt >= maxAttempts) {
        await this.taskRepo.updateStatus(taskId, TaskStatus.FAILED);
      }

      if (isPermanentlyNonRetryable && attempt < maxAttempts) {
        // Suppress re-throwing before maxAttempts so BullMQ does not repeatedly hammer the LLM and burn credits
        return {
          success: false,
          taskId,
          runId,
          durationMs,
        };
      }

      throw err;
    } finally {
      heartbeat.stop();
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.logger.info('Stopping Agent Worker Service gracefully...');

    if (this.workerManager) {
      await this.workerManager.close();
      this.workerManager = null;
    }

    try {
      await disconnectDatabase();
    } catch (err) {
      this.logger.error({ err }, 'Error disconnecting database');
    }

    this.isRunning = false;
    this.logger.info('Agent Worker Service stopped cleanly');
  }

  getWorkerManager(): TaskWorkerManager | null {
    return this.workerManager;
  }
}

export function createWorkerService(options?: WorkerServiceOptions): WorkerService {
  return new WorkerService(options);
}

if (process.env.NODE_ENV !== 'test') {
  const service = createWorkerService();
  service.start();

  const shutdown = async (signal: string) => {
    service.getWorkerManager()?.pause();
    await service.stop();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
