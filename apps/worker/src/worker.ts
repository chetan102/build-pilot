import { createLogger, Logger } from '@buildpilot/observability';
import { loadConfig } from '@buildpilot/config';
import {
  connectToDatabase,
  disconnectDatabase,
  taskRepository as defaultTaskRepository,
  taskRunRepository as defaultTaskRunRepository,
  eventRepository as defaultEventRepository,
  TaskRepository,
  TaskRunRepository,
  EventRepository,
} from '@buildpilot/database';
import {
  TaskWorkerManager,
  EngineeringTaskJobPayload,
  DEFAULT_WORKER_CONCURRENCY,
} from '@buildpilot/queue';
import { TaskStatus, TaskRunStatus, LLMProviderType } from '@buildpilot/domain';
import { LLMProvider, providerFactory, MockLLMProvider } from '@buildpilot/llm';
import { toolRegistry as defaultToolRegistry, ToolRegistry } from '@buildpilot/tools';
import { agentCoreLoop, AgentCoreLoop } from './agent/index.js';
import { Job } from 'bullmq';

const config = loadConfig();

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
    const { taskId, runId, title, description, branch, provider, model, maxSteps, correlationId } = job.data;
    const attempt = job.attemptsMade + 1;
    const startTime = Date.now();

    this.logger.info(
      { jobId: job.id, taskId, runId, title, branch, attempt },
      'Worker picked up engineering task job',
    );

    try {
      // 1. Initialize / persist TaskRun state
      const existingRun = await this.taskRunRepo.findById(runId);
      if (!existingRun) {
        await this.taskRunRepo.create({
          _id: runId,
          taskId,
          status: TaskRunStatus.RUNNING,
          branch,
          provider: provider || LLMProviderType.OPENROUTER,
          model: model || 'anthropic/claude-3.5-sonnet',
          maxSteps: maxSteps || 30,
          startedAt: new Date(),
        });
      } else {
        await this.taskRunRepo.markStarted(runId, new Date());
      }

      // 2. Transition Task status to PLANNING (active execution phase)
      await this.taskRepo.updateStatus(taskId, TaskStatus.PLANNING, {
        activeRunId: runId,
      });

      // 3. Record TASK_RUN_STARTED event
      await this.eventRepo.create({
        taskId,
        runId,
        type: 'TASK_RUN_STARTED',
        payload: {
          jobId: job.id,
          attempt,
          branch,
          provider: provider || LLMProviderType.OPENROUTER,
          model: model || 'anthropic/claude-3.5-sonnet',
          correlationId,
        },
        level: 'info',
      });

      // 4. Execute the agent workflow (custom executor or full autonomous agent pipeline)
      let executionOutput: Record<string, unknown> | undefined;
      if (this.jobExecutor) {
        const res = await this.jobExecutor(job.data, job);
        if (!res.success) {
          throw new Error('Agent execution failed during step processing');
        }
        executionOutput = res.output;
      } else {
        this.logger.info(
          { taskId, runId, branch },
          'Executing agent workflow pipeline with autonomous tools',
        );

        // Resolve or instantiate LLM provider
        let llmProvider = this.options.llmProvider;
        if (!llmProvider) {
          try {
            llmProvider = providerFactory.get(provider || LLMProviderType.OPENROUTER);
          } catch {
            llmProvider = new MockLLMProvider();
          }
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
          undefined,
          llmProvider,
          this.toolRegistry,
        );

        if (!agentResult.success && !agentResult.finalAnswer) {
          throw new Error(agentResult.error || 'Agent loop terminated unsuccessfully');
        }

        executionOutput = {
          finalAnswer: agentResult.finalAnswer,
          totalSteps: agentResult.totalSteps,
          totalTokens: agentResult.totalTokens,
        };
      }

      const durationMs = Date.now() - startTime;

      // 5. Mark TaskRun as COMPLETED
      await this.taskRunRepo.markCompleted(runId, durationMs);

      // 6. Transition Task to COMPLETED (or next stage)
      await this.taskRepo.updateStatus(taskId, TaskStatus.COMPLETED, {
        completedRunId: runId,
      });

      // 7. Record TASK_RUN_COMPLETED event
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

      // If attempts exhausted, transition Task to FAILED
      const maxAttempts = job.opts?.attempts ?? 3;
      if (attempt >= maxAttempts) {
        await this.taskRepo.updateStatus(taskId, TaskStatus.FAILED);
      }

      throw err;
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
