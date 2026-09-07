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
  AgentStepRepository,
  ToolCallRepository,
  EventRepository,
  TaskRunRepository,
} from '@buildpilot/database';
import { ToolRegistry } from '@buildpilot/tools';
import { AgentStepStage, ToolCallStatus } from '@buildpilot/domain';
import { createLogger, Logger } from '@buildpilot/observability';
import { ContextBuilder, contextBuilder as defaultContextBuilder } from './context-builder.js';
import { TaskContext, RepoContext, TokenBudgetOptions } from './types.js';

export interface AgentLoopOptions {
  model?: string;
  maxSteps?: number;
  maxWallClockMs?: number;
  perToolTimeoutMs?: number;
  workspaceDir?: string;
  tokenBudget?: Partial<TokenBudgetOptions>;
  signal?: AbortSignal;
  logger?: Logger;
  contextBuilder?: ContextBuilder;
  agentStepRepository?: AgentStepRepository;
  toolCallRepository?: ToolCallRepository;
  eventRepository?: EventRepository;
  taskRunRepository?: TaskRunRepository;
}

export interface AgentLoopResult {
  success: boolean;
  finalAnswer?: string;
  totalSteps: number;
  totalTokens: TokenUsage;
  durationMs: number;
  error?: string;
  aborted?: boolean;
}

export class AgentCoreLoop {
  private logger: Logger;
  private contextBuilder: ContextBuilder;
  private stepRepo: AgentStepRepository;
  private toolCallRepo: ToolCallRepository;
  private eventRepo: EventRepository;
  private taskRunRepo: TaskRunRepository;

  constructor(private options: AgentLoopOptions = {}) {
    this.logger = options.logger || createLogger({ serviceName: 'agent-core-loop' });
    this.contextBuilder = options.contextBuilder || defaultContextBuilder;
    this.stepRepo = options.agentStepRepository || agentStepRepository;
    this.toolCallRepo = options.toolCallRepository || toolCallRepository;
    this.eventRepo = options.eventRepository || eventRepository;
    this.taskRunRepo = options.taskRunRepository || taskRunRepository;
  }

  async run(
    task: TaskContext,
    repo: RepoContext | undefined,
    provider: LLMProvider,
    tools: ToolRegistry,
  ): Promise<AgentLoopResult> {
    const startTime = Date.now();
    const model = this.options.model || 'anthropic/claude-3.5-sonnet';
    const maxSteps = this.options.maxSteps || 30;
    const maxWallClockMs = this.options.maxWallClockMs || 10 * 60 * 1000;
    const perToolTimeoutMs = this.options.perToolTimeoutMs || 30000;
    const workspaceDir = this.options.workspaceDir || repo?.workspacePath || process.cwd();
    const signal = this.options.signal;

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

      // 1. Safety check: Check cancellation signal
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

      // 2. Safety check: Check wall clock limit
      if (Date.now() - startTime > maxWallClockMs) {
        this.logger.warn(
          { taskId: task.taskId, runId: task.runId, maxWallClockMs },
          'Agent loop exceeded max wall-clock duration',
        );
        return {
          success: false,
          error: `Max wall-clock limit of ${maxWallClockMs}ms exceeded`,
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

      // 4. Dispatch request to LLM provider
      let response;
      try {
        response = await provider.generate({
          model,
          systemPrompt: context.systemPrompt,
          messages: context.messages,
          tools: availableLLMTools.length > 0 ? availableLLMTools : undefined,
          toolChoice: availableLLMTools.length > 0 ? 'auto' : undefined,
          temperature: 0.1,
        });
      } catch (err: any) {
        this.logger.error({ step: currentStepIndex, err }, 'LLM generation failed in agent loop');
        throw err;
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

          await this.updateToolCallState(toolCallDbId, ToolCallStatus.FAILED, undefined, errMsg, Date.now() - toolStartTime);
          history.push({
            role: 'tool',
            toolCallId: toolCall.id,
            name: toolCall.name,
            content: JSON.stringify({ error: errMsg }),
          });
          continue;
        }

        // Validate tool arguments against Zod schema
        const validation = toolDef.inputSchema.safeParse(toolCall.arguments);
        if (!validation.success) {
          const zodError = `Validation Error in arguments for '${toolCall.name}': ${validation.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`;
          this.logger.warn({ tool: toolCall.name, zodError }, 'Tool call input validation failed');

          await this.updateToolCallState(toolCallDbId, ToolCallStatus.FAILED, undefined, zodError, Date.now() - toolStartTime);
          history.push({
            role: 'tool',
            toolCallId: toolCall.id,
            name: toolCall.name,
            content: JSON.stringify({ error: zodError, hint: 'Please correct the arguments and try again.' }),
          });
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

          this.logger.error({ tool: toolCall.name, err: errorMessage, durationMs: toolDurationMs }, 'Tool execution error');
          await this.updateToolCallState(toolCallDbId, ToolCallStatus.FAILED, undefined, errorMessage, toolDurationMs);

          history.push({
            role: 'tool',
            toolCallId: toolCall.id,
            name: toolCall.name,
            content: JSON.stringify({ error: `Tool execution error: ${errorMessage}` }),
          });
        }
      }
    }

    return {
      success: false,
      error: `Agent reached maximum step limit (${maxSteps}) without completing`,
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
}

export const agentCoreLoop = new AgentCoreLoop();
