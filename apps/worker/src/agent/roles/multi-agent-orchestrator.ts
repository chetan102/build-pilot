import { ToolRegistry } from '@buildpilot/tools';
import { LLMProvider } from '@buildpilot/llm';
import { taskRepository, taskRunRepository, eventRepository } from '@buildpilot/database';
import { TaskStatus } from '@buildpilot/domain';
import { createLogger, Logger } from '@buildpilot/observability';
import { TaskContext, RepoContext } from '../types.js';
import { PlannerRole } from './planner-role.js';
import { DeveloperRole } from './developer-role.js';
import { ReviewerRole } from './reviewer-role.js';

export interface MultiAgentOrchestratorOptions {
  planner?: PlannerRole;
  developer?: DeveloperRole;
  reviewer?: ReviewerRole;
  maxRepairCycles?: number;
  logger?: Logger;
}

export interface MultiAgentExecutionResult {
  success: boolean;
  plan: string;
  finalDiff: string;
  reviewFeedback: string;
  repairCycles: number;
  totalSteps: number;
  durationMs: number;
}

export class MultiAgentOrchestrator {
  private planner: PlannerRole;
  private developer: DeveloperRole;
  private reviewer: ReviewerRole;
  private maxRepairCycles: number;
  private logger: Logger;

  constructor(options: MultiAgentOrchestratorOptions = {}) {
    this.planner = options.planner || new PlannerRole();
    this.developer = options.developer || new DeveloperRole();
    this.reviewer = options.reviewer || new ReviewerRole();
    this.maxRepairCycles = options.maxRepairCycles ?? 3;
    this.logger = options.logger || createLogger({ serviceName: 'multi-agent-orchestrator' });
  }

  async run(
    task: TaskContext,
    repo: RepoContext | undefined,
    provider: LLMProvider,
    tools: ToolRegistry,
  ): Promise<MultiAgentExecutionResult> {
    const startTime = Date.now();
    let totalSteps = 0;
    let repairCycles = 0;

    this.logger.info({ taskId: task.taskId, runId: task.runId }, 'Starting multi-agent orchestration');

    // 1. Planner Phase
    await taskRepository.updateStatus(task.taskId, TaskStatus.PLANNING);
    await eventRepository.create({
      taskId: task.taskId,
      runId: task.runId,
      type: 'ROLE_STAGE_STARTED',
      payload: { role: 'PLANNER', stage: 'PLANNING' },
      level: 'info',
    });

    const planResult = await this.planner.plan(task, repo, provider, tools);
    totalSteps += planResult.steps;

    await taskRunRepository.saveCheckpoint(task.runId, {
      stage: 'READY_FOR_DEVELOPMENT',
      stepIndex: totalSteps,
      summary: 'Implementation plan completed',
    });

    // 2. Developer Phase
    await taskRepository.updateStatus(task.taskId, TaskStatus.DEVELOPMENT);
    await eventRepository.create({
      taskId: task.taskId,
      runId: task.runId,
      type: 'ROLE_STAGE_STARTED',
      payload: { role: 'DEVELOPER', stage: 'DEVELOPMENT' },
      level: 'info',
    });

    const devResult = await this.developer.develop(task, planResult.plan, repo, provider, tools);
    totalSteps += devResult.steps;

    // Extract diff using git_diff tool
    let currentDiff = '';
    const gitDiffTool = tools.get('git_diff');
    if (gitDiffTool) {
      try {
        const diffRes: any = await gitDiffTool.execute({}, {
          workspaceDir: repo?.workspacePath || process.cwd(),
          taskId: task.taskId,
          runId: task.runId,
        });
        currentDiff = diffRes?.diff || '';
      } catch {
        currentDiff = 'Diff unavailable';
      }
    }

    // 3. Reviewer Phase & Bounded Repair Loop
    let reviewVerdict: { approved: boolean; feedback: string; steps: number } = {
      approved: false,
      feedback: '',
      steps: 0,
    };

    while (repairCycles < this.maxRepairCycles) {
      await taskRepository.updateStatus(task.taskId, TaskStatus.REVIEW);
      const revResult = await this.reviewer.review(task, currentDiff, repo, provider, tools);
      totalSteps += revResult.steps;
      reviewVerdict = revResult;

      if (revResult.approved) {
        this.logger.info({ taskId: task.taskId, repairCycles }, 'Reviewer approved changes!');
        break;
      }

      repairCycles++;
      this.logger.warn(
        { taskId: task.taskId, repairCycles, maxCycles: this.maxRepairCycles },
        'Reviewer requested changes, executing bounded repair cycle',
      );

      await taskRepository.updateStatus(task.taskId, TaskStatus.REPAIRING);
      await eventRepository.create({
        taskId: task.taskId,
        runId: task.runId,
        type: 'REPAIR_CYCLE_STARTED',
        payload: { cycle: repairCycles, feedback: revResult.feedback },
        level: 'warn',
      });

      // Developer repairs code with review feedback
      const repairResult = await this.developer.develop(
        {
          ...task,
          userInstructions: `Reviewer requested changes (Cycle ${repairCycles}/${this.maxRepairCycles}):\n${revResult.feedback}\n\nPlease fix the identified issues and re-verify.`,
        },
        planResult.plan,
        repo,
        provider,
        tools,
      );
      totalSteps += repairResult.steps;

      // Refresh diff
      if (gitDiffTool) {
        try {
          const diffRes: any = await gitDiffTool.execute({}, {
            workspaceDir: repo?.workspacePath || process.cwd(),
            taskId: task.taskId,
            runId: task.runId,
          });
          currentDiff = diffRes?.diff || '';
        } catch {
          // ignore
        }
      }
    }

    const durationMs = Date.now() - startTime;

    return {
      success: reviewVerdict.approved || repairCycles < this.maxRepairCycles,
      plan: planResult.plan,
      finalDiff: currentDiff,
      reviewFeedback: reviewVerdict.feedback,
      repairCycles,
      totalSteps,
      durationMs,
    };
  }
}
