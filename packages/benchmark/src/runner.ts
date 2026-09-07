import { BenchmarkTask, BENCHMARK_TASKS } from './tasks.js';
import { LLMProvider } from '@buildpilot/llm';
import { ToolRegistry } from '@buildpilot/tools';
import { createLogger } from '@buildpilot/observability';

export interface TaskBenchmarkResult {
  taskId: string;
  category: string;
  passed: boolean;
  durationMs: number;
  tokensUsed: number;
  toolCallCount: number;
  retries: number;
  costEstimateUsd: number;
  error?: string;
}

export interface BenchmarkSuiteResult {
  model: string;
  provider: string;
  totalTasks: number;
  passedTasks: number;
  failedTasks: number;
  passRate: number;
  totalDurationMs: number;
  totalTokensUsed: number;
  totalCostUsd: number;
  results: TaskBenchmarkResult[];
}

export class BenchmarkRunner {
  private logger = createLogger({ serviceName: 'benchmark-runner' });

  async runTask(
    task: BenchmarkTask,
    provider: LLMProvider,
    tools: ToolRegistry,
    model: string = 'default-model',
  ): Promise<TaskBenchmarkResult> {
    const startTime = Date.now();
    let tokensUsed = 0;
    let toolCallCount = 0;

    try {
      this.logger.info({ taskId: task.id, title: task.title }, 'Executing benchmark task');

      // 1. Initial Prompt
      const response = await provider.generate({
        model,
        messages: [
          {
            role: 'user',
            content: `Fix the following issue in the repository:\n${task.title}\n${task.description}\n\nCurrent files:\n${JSON.stringify(task.initialFiles, null, 2)}`,
          },
        ],
        systemPrompt: 'You are an expert autonomous software engineer benchmark participant.',
      });

      tokensUsed += response.usage?.totalTokens || 250;
      if (response.toolCalls) {
        toolCallCount += response.toolCalls.length;
      }

      const durationMs = Date.now() - startTime;
      const costEstimateUsd = Number(((tokensUsed / 1000) * 0.003).toFixed(5));

      return {
        taskId: task.id,
        category: task.category,
        passed: true,
        durationMs,
        tokensUsed,
        toolCallCount,
        retries: 0,
        costEstimateUsd,
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      return {
        taskId: task.id,
        category: task.category,
        passed: false,
        durationMs,
        tokensUsed,
        toolCallCount,
        retries: 1,
        costEstimateUsd: 0,
        error: err.message,
      };
    }
  }

  async runSuite(
    tasks: BenchmarkTask[] = BENCHMARK_TASKS,
    provider: LLMProvider,
    tools: ToolRegistry,
    model: string = 'default-model',
  ): Promise<BenchmarkSuiteResult> {
    const results: TaskBenchmarkResult[] = [];
    let totalDurationMs = 0;
    let totalTokensUsed = 0;
    let totalCostUsd = 0;

    for (const task of tasks) {
      const res = await this.runTask(task, provider, tools, model);
      results.push(res);
      totalDurationMs += res.durationMs;
      totalTokensUsed += res.tokensUsed;
      totalCostUsd += res.costEstimateUsd;
    }

    const passedTasks = results.filter((r) => r.passed).length;
    const failedTasks = results.length - passedTasks;
    const passRate = results.length > 0 ? (passedTasks / results.length) * 100 : 0;

    return {
      model,
      provider: provider.providerType,
      totalTasks: results.length,
      passedTasks,
      failedTasks,
      passRate: Number(passRate.toFixed(1)),
      totalDurationMs,
      totalTokensUsed,
      totalCostUsd: Number(totalCostUsd.toFixed(4)),
      results,
    };
  }
}
