import {
  LLMProvider,
  LLMMessage,
  TokenUsage,
} from '@buildpilot/llm';
import {
  agentStepRepository,
  toolCallRepository,
  eventRepository,
  taskRunRepository,
  taskRepository,
  AgentStepRepository,
  ToolCallRepository,
  EventRepository,
  TaskRunRepository,
  TaskRepository,
} from '@buildpilot/database';
import { ToolRegistry } from '@buildpilot/tools';
import { AgentStepStage, ToolCallStatus, TaskStatus } from '@buildpilot/domain';
import { createLogger, Logger } from '@buildpilot/observability';
import { ContextBuilder, contextBuilder as defaultContextBuilder } from './context-builder.js';
import { TaskContext, RepoContext, TokenBudgetOptions } from './types.js';
import { retryWithBackoff, LoopDetector, RetryOptions } from './failure-recovery.js';

export interface AgentLoopOptions {
  model?: string;
  maxSteps?: number;
  maxWallClockMs?: number;
  perToolTimeoutMs?: number;
  workspaceDir?: string;
  tokenBudget?: Partial<TokenBudgetOptions>;
  retryOptions?: RetryOptions;
  signal?: AbortSignal;
  logger?: Logger;
  contextBuilder?: ContextBuilder;
  agentStepRepository?: AgentStepRepository;
  toolCallRepository?: ToolCallRepository;
  eventRepository?: EventRepository;
  taskRunRepository?: TaskRunRepository;
  taskRepository?: TaskRepository;
}

export interface AgentLoopResult {
  success: boolean;
  finalAnswer?: string;
  totalSteps: number;
  totalTokens: TokenUsage;
  durationMs: number;
  error?: string;
  aborted?: boolean;
  blocked?: boolean;
}

export class AgentCoreLoop {
  private logger: Logger;
  private contextBuilder: ContextBuilder;
  private stepRepo: AgentStepRepository;
  private toolCallRepo: ToolCallRepository;
  private eventRepo: EventRepository;
  private taskRunRepo: TaskRunRepository;
  private taskRepo: TaskRepository;

  constructor(private options: AgentLoopOptions = {}) {
    this.logger = options.logger || createLogger({ serviceName: 'agent-core-loop' });
    this.contextBuilder = options.contextBuilder || defaultContextBuilder;
    this.stepRepo = options.agentStepRepository || agentStepRepository;
    this.toolCallRepo = options.toolCallRepository || toolCallRepository;
    this.eventRepo = options.eventRepository || eventRepository;
    this.taskRunRepo = options.taskRunRepository || taskRunRepository;
    this.taskRepo = options.taskRepository || taskRepository;
  }

  async run(
    task: TaskContext,
    repo: RepoContext | undefined,
    provider: LLMProvider,
    tools: ToolRegistry,
    runtimeOptions?: { model?: string; maxSteps?: number; workspaceDir?: string; signal?: AbortSignal },
  ): Promise<AgentLoopResult> {
    const startTime = Date.now();
    const model = runtimeOptions?.model || this.options.model || (provider as any).config?.defaultModel || 'gpt-4o';
    const maxSteps = runtimeOptions?.maxSteps || this.options.maxSteps || 30;
    const maxWallClockMs = this.options.maxWallClockMs || 10 * 60 * 1000;
    const perToolTimeoutMs = this.options.perToolTimeoutMs || 30000;
    const workspaceDir = runtimeOptions?.workspaceDir || this.options.workspaceDir || repo?.workspacePath || process.cwd();
    const signal = runtimeOptions?.signal || this.options.signal;
    const loopDetector = new LoopDetector();

    const accumulatedUsage: TokenUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };

    const history: LLMMessage[] = [];
    let currentStepIndex = 0;
    let finalAnswer: string | undefined;

    this.logger.info(
      { taskId: task.taskId, runId: task.runId, model, maxSteps, workspaceDir },
      'Starting Agent Core Loop execution',
    );

    while (currentStepIndex < maxSteps) {
      currentStepIndex++;
      const stepStartTime = Date.now();

      // 1. Safety check: Check cancellation signal or live DB task status
      if (signal?.aborted) {
        this.logger.warn({ taskId: task.taskId, runId: task.runId }, 'Agent loop aborted by cancellation signal');
        return {
          success: false,
          aborted: true,
          error: 'Execution cancelled by user or timeout signal',
          totalSteps: currentStepIndex - 1,
          totalTokens: accumulatedUsage,
          durationMs: Date.now() - startTime,
        };
      }

      try {
        const liveTask = await this.taskRepo.findById(task.taskId);
        if (liveTask?.status === TaskStatus.CANCELLED) {
          this.logger.info({ taskId: task.taskId, runId: task.runId }, 'Task was cancelled in database. Stopping agent loop immediately.');
          return {
            success: false,
            aborted: true,
            error: 'Task was cancelled by user',
            totalSteps: currentStepIndex - 1,
            totalTokens: accumulatedUsage,
            durationMs: Date.now() - startTime,
          };
        }
      } catch {
        // ignore non-fatal lookup error
      }

      // 2. Safety check: Check wall clock limit
      if (Date.now() - startTime > maxWallClockMs) {
        const timeoutError = `Max wall-clock limit of ${maxWallClockMs}ms exceeded`;
        this.logger.warn({ taskId: task.taskId, runId: task.runId, maxWallClockMs }, timeoutError);
        return {
          success: false,
          error: timeoutError,
          totalSteps: currentStepIndex - 1,
          totalTokens: accumulatedUsage,
          durationMs: Date.now() - startTime,
        };
      }

      // 3. Build structured context and token-budgeted prompt
      const context = this.contextBuilder.build({
        task,
        repo,
        history,
        tokenBudget: this.options.tokenBudget,
      });

      const availableLLMTools = tools.toLLMTools();

      this.logger.info(
        {
          step: currentStepIndex,
          estimatedTokens: context.estimatedTokens,
          messageCount: context.messages.length,
          toolCount: availableLLMTools.length,
        },
        'Sending step request to LLM provider',
      );

      // 4. Dispatch request to LLM provider with exponential backoff for transient errors
      let response;
      try {
        response = await retryWithBackoff(
          () =>
            provider.generate({
              model,
              systemPrompt: context.systemPrompt,
              messages: context.messages,
              tools: availableLLMTools.length > 0 ? availableLLMTools : undefined,
              toolChoice: availableLLMTools.length > 0 ? 'auto' : undefined,
              temperature: 0.1,
            }),
          this.options.retryOptions || {
            maxRetries: 3,
            initialDelayMs: 500,
            logger: this.logger,
          },
        );
      } catch (err: any) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.logger.error({ step: currentStepIndex, err: errorMsg }, 'LLM generation failed after retries');
        
        await this.recordFailureEvent(task, currentStepIndex, errorMsg, Date.now() - startTime);

        return {
          success: false,
          error: `LLM Provider Error: ${errorMsg}`,
          totalSteps: currentStepIndex,
          totalTokens: accumulatedUsage,
          durationMs: Date.now() - startTime,
        };
      }

      // 5. Track token usage
      if (response.usage) {
        accumulatedUsage.promptTokens += response.usage.promptTokens;
        accumulatedUsage.completionTokens += response.usage.completionTokens;
        accumulatedUsage.totalTokens += response.usage.totalTokens;
      }

      const stepDurationMs = Date.now() - stepStartTime;
      const stepTitle = response.toolCalls && response.toolCalls.length > 0
        ? `Step ${currentStepIndex}: Tool Execution (${response.toolCalls.map((t) => t.name).join(', ')})`
        : `Step ${currentStepIndex}: Model Response`;

      // 6. Persist AgentStep in MongoDB
      let savedStep: any;
      try {
        savedStep = await this.stepRepo.create({
          runId: task.runId,
          taskId: task.taskId,
          stage: response.toolCalls && response.toolCalls.length > 0 ? AgentStepStage.DEVELOPMENT : AgentStepStage.REVIEW,
          title: stepTitle,
          thought: response.content || undefined,
          durationMs: stepDurationMs,
          tokenUsage: response.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        });
      } catch (err) {
        this.logger.warn({ err }, 'Failed to persist AgentStep record (non-fatal)');
      }

      const stepId = savedStep?._id?.toString() || `step_${currentStepIndex}`;

      // 7. Check if model produced tool calls or final answer
      if (!response.toolCalls || response.toolCalls.length === 0) {
        finalAnswer = response.content || 'Task completed';
        history.push({
          role: 'assistant',
          content: response.content,
        });

        this.logger.info(
          { step: currentStepIndex, finalAnswer: finalAnswer.slice(0, 100) },
          'Agent produced final response message without tool calls. Finishing loop.',
        );

        return {
          success: true,
          finalAnswer,
          totalSteps: currentStepIndex,
          totalTokens: accumulatedUsage,
          durationMs: Date.now() - startTime,
        };
      }

      // 8. Process tool calls
      history.push({
        role: 'assistant',
        content: response.content,
        toolCalls: response.toolCalls,
      });

      for (const toolCall of response.toolCalls) {
        const toolStartTime = Date.now();
        const toolDef = tools.get(toolCall.name);

        // Persist ToolCall record in database
        let savedToolCall: any;
        try {
          savedToolCall = await this.toolCallRepo.create({
            runId: task.runId,
            stepId,
            name: toolCall.name,
            permissionClass: toolDef?.permissionClass || 'READ_ONLY',
            status: ToolCallStatus.RUNNING,
            input: toolCall.arguments,
          });
        } catch (err) {
          this.logger.warn({ err }, 'Failed to persist ToolCall record (non-fatal)');
        }

        const toolCallDbId = savedToolCall?._id?.toString() || toolCall.id;

        if (!toolDef) {
          const errMsg = `Error: Tool '${toolCall.name}' is not registered or supported.`;
          this.logger.warn({ tool: toolCall.name }, 'Model requested unknown tool');

          const loopCheck = loopDetector.recordCall(toolCall.name, toolCall.arguments, false);
          await this.updateToolCallState(toolCallDbId, ToolCallStatus.FAILED, undefined, errMsg, Date.now() - toolStartTime);
          
          if (loopCheck.isLoop) {
            const loopErr = `Infinite failure loop detected: Tool '${toolCall.name}' failed ${loopCheck.count} times consecutively.`;
            return {
              success: false,
              blocked: true,
              error: loopErr,
              totalSteps: currentStepIndex,
              totalTokens: accumulatedUsage,
              durationMs: Date.now() - startTime,
            };
          }

          history.push({
            role: 'tool',
            toolCallId: toolCall.id,
            name: toolCall.name,
            content: JSON.stringify({
              error: errMsg,
              hint: `Available tools are: ${tools.list().map((t) => t.name).join(', ')}. Please use one of the supported tools.`,
            }),
          });
          continue;
        }

        // Validate tool arguments against Zod schema
        const validation = toolDef.inputSchema.safeParse(toolCall.arguments);
        if (!validation.success) {
          const zodError = `Validation Error in arguments for '${toolCall.name}': ${validation.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`;
          this.logger.warn({ tool: toolCall.name, zodError }, 'Tool call input validation failed');

          const loopCheck = loopDetector.recordCall(toolCall.name, toolCall.arguments, false);
          await this.updateToolCallState(toolCallDbId, ToolCallStatus.FAILED, undefined, zodError, Date.now() - toolStartTime);

          if (loopCheck.isLoop) {
            const loopErr = `Infinite failure loop detected: Tool '${toolCall.name}' argument validation failed ${loopCheck.count} times.`;
            return {
              success: false,
              blocked: true,
              error: loopErr,
              totalSteps: currentStepIndex,
              totalTokens: accumulatedUsage,
              durationMs: Date.now() - startTime,
            };
          }

          history.push({
            role: 'tool',
            toolCallId: toolCall.id,
            name: toolCall.name,
            content: JSON.stringify({
              error: zodError,
              hint: 'Please check the required argument schema, correct the parameters, and try again.',
            }),
          });

          if (loopCheck.shouldWarn) {
            history.push({
              role: 'user',
              content: `[SYSTEM WARNING]: Tool '${toolCall.name}' with identical arguments has failed 3 times. Please try a different approach or fix the argument format.`,
            });
          }
          continue;
        }

        // Execute tool with per-tool timeout
        this.logger.info({ tool: toolCall.name, args: toolCall.arguments }, 'Executing tool');
        try {
          const toolResult = await this.executeToolWithTimeout(
            toolDef,
            validation.data,
            {
              workspaceDir,
              taskId: task.taskId,
              runId: task.runId,
              signal,
            },
            perToolTimeoutMs,
          );

          const toolDurationMs = Date.now() - toolStartTime;
          loopDetector.recordCall(toolCall.name, toolCall.arguments, true);
          await this.updateToolCallState(toolCallDbId, ToolCallStatus.SUCCESS, toolResult as any, undefined, toolDurationMs);

          const stringifiedResult = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
          history.push({
            role: 'tool',
            toolCallId: toolCall.id,
            name: toolCall.name,
            content: stringifiedResult,
          });

          this.logger.info({ tool: toolCall.name, durationMs: toolDurationMs }, 'Tool executed successfully');
        } catch (err: any) {
          const toolDurationMs = Date.now() - toolStartTime;
          const errorMessage = err instanceof Error ? err.message : String(err);

          const loopCheck = loopDetector.recordCall(toolCall.name, toolCall.arguments, false);
          this.logger.error({ tool: toolCall.name, err: errorMessage, durationMs: toolDurationMs }, 'Tool execution error');
          await this.updateToolCallState(toolCallDbId, ToolCallStatus.FAILED, undefined, errorMessage, toolDurationMs);

          if (loopCheck.isLoop) {
            const loopErr = `Infinite failure loop detected: Tool '${toolCall.name}' execution failed ${loopCheck.count} consecutive times.`;
            return {
              success: false,
              blocked: true,
              error: loopErr,
              totalSteps: currentStepIndex,
              totalTokens: accumulatedUsage,
              durationMs: Date.now() - startTime,
            };
          }

          history.push({
            role: 'tool',
            toolCallId: toolCall.id,
            name: toolCall.name,
            content: JSON.stringify({
              error: `Tool execution failed: ${errorMessage}`,
              hint: 'Analyze the error above, make necessary adjustments, or use an alternative tool.',
            }),
          });

          if (loopCheck.shouldWarn) {
            history.push({
              role: 'user',
              content: `[SYSTEM WARNING]: Tool '${toolCall.name}' with identical parameters has failed 3 times consecutively. Do not repeat this exact command. Try an alternative solution.`,
            });
          }
        }
      }
    }

    const stepLimitError = `Agent reached maximum step limit (${maxSteps}) without completing`;
    await this.recordFailureEvent(task, maxSteps, stepLimitError, Date.now() - startTime);

    return {
      success: false,
      error: stepLimitError,
      totalSteps: maxSteps,
      totalTokens: accumulatedUsage,
      durationMs: Date.now() - startTime,
    };
  }

  private async executeToolWithTimeout(
    tool: any,
    input: unknown,
    context: any,
    timeoutMs: number,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Tool execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      tool
        .execute(input, context)
        .then((res: unknown) => {
          clearTimeout(timer);
          resolve(res);
        })
        .catch((err: unknown) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  private async updateToolCallState(
    id: string,
    status: any,
    output?: Record<string, unknown>,
    error?: string,
    durationMs?: number,
  ): Promise<void> {
    try {
      await this.toolCallRepo.updateStatus(id, status, {
        output,
        error,
        durationMs,
      });
    } catch {
      // Non-fatal database update failure
    }
  }

  private async recordFailureEvent(
    task: TaskContext,
    step: number,
    error: string,
    durationMs: number,
  ): Promise<void> {
    try {
      await this.eventRepo.create({
        taskId: task.taskId,
        runId: task.runId,
        type: 'AGENT_EXECUTION_FAILED',
        payload: {
          step,
          error,
          durationMs,
        },
        level: 'error',
      });
    } catch {
      // Non-fatal
    }
  }
}

export const agentCoreLoop = new AgentCoreLoop();
