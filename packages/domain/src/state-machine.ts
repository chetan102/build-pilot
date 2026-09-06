import { TaskStatus, TaskStatusType } from './enums.js';
import { InvalidStateTransitionError } from './errors.js';

export const TERMINAL_TASK_STATUSES: ReadonlySet<TaskStatusType> = new Set([
  TaskStatus.COMPLETED,
  TaskStatus.FAILED,
  TaskStatus.CANCELLED,
  TaskStatus.TIMED_OUT,
]);

export const ERROR_TASK_STATUSES: ReadonlySet<TaskStatusType> = new Set([
  TaskStatus.FAILED,
  TaskStatus.CANCELLED,
  TaskStatus.BLOCKED,
  TaskStatus.TIMED_OUT,
]);

export const ACTIVE_TASK_STATUSES: ReadonlySet<TaskStatusType> = new Set([
  TaskStatus.PLANNING,
  TaskStatus.READY_FOR_DEVELOPMENT,
  TaskStatus.DEVELOPMENT,
  TaskStatus.TESTING,
  TaskStatus.REPAIRING,
  TaskStatus.REVIEW,
  TaskStatus.CHANGES_REQUESTED,
  TaskStatus.AWAITING_APPROVAL,
  TaskStatus.PR_READY,
]);

/**
 * Transition Matrix defining valid state transitions for autonomous tasks.
 */
export const ALLOWED_TASK_TRANSITIONS: Record<TaskStatusType, readonly TaskStatusType[]> = {
  [TaskStatus.QUEUED]: [
    TaskStatus.PLANNING,
    TaskStatus.CANCELLED,
    TaskStatus.FAILED,
    TaskStatus.BLOCKED,
  ],
  [TaskStatus.PLANNING]: [
    TaskStatus.READY_FOR_DEVELOPMENT,
    TaskStatus.DEVELOPMENT,
    TaskStatus.FAILED,
    TaskStatus.CANCELLED,
    TaskStatus.BLOCKED,
    TaskStatus.TIMED_OUT,
  ],
  [TaskStatus.READY_FOR_DEVELOPMENT]: [
    TaskStatus.DEVELOPMENT,
    TaskStatus.FAILED,
    TaskStatus.CANCELLED,
    TaskStatus.BLOCKED,
  ],
  [TaskStatus.DEVELOPMENT]: [
    TaskStatus.TESTING,
    TaskStatus.AWAITING_APPROVAL,
    TaskStatus.FAILED,
    TaskStatus.CANCELLED,
    TaskStatus.BLOCKED,
    TaskStatus.TIMED_OUT,
  ],
  [TaskStatus.TESTING]: [
    TaskStatus.REVIEW,
    TaskStatus.REPAIRING,
    TaskStatus.FAILED,
    TaskStatus.CANCELLED,
    TaskStatus.BLOCKED,
    TaskStatus.TIMED_OUT,
  ],
  [TaskStatus.REPAIRING]: [
    TaskStatus.DEVELOPMENT,
    TaskStatus.TESTING,
    TaskStatus.FAILED,
    TaskStatus.CANCELLED,
    TaskStatus.BLOCKED,
    TaskStatus.TIMED_OUT,
  ],
  [TaskStatus.REVIEW]: [
    TaskStatus.AWAITING_APPROVAL,
    TaskStatus.PR_READY,
    TaskStatus.CHANGES_REQUESTED,
    TaskStatus.FAILED,
    TaskStatus.CANCELLED,
    TaskStatus.BLOCKED,
  ],
  [TaskStatus.CHANGES_REQUESTED]: [
    TaskStatus.REPAIRING,
    TaskStatus.DEVELOPMENT,
    TaskStatus.FAILED,
    TaskStatus.CANCELLED,
    TaskStatus.BLOCKED,
  ],
  [TaskStatus.AWAITING_APPROVAL]: [
    TaskStatus.PR_READY,
    TaskStatus.DEVELOPMENT,
    TaskStatus.REPAIRING,
    TaskStatus.FAILED,
    TaskStatus.CANCELLED,
    TaskStatus.BLOCKED,
  ],
  [TaskStatus.PR_READY]: [
    TaskStatus.COMPLETED,
    TaskStatus.FAILED,
    TaskStatus.CANCELLED,
  ],
  [TaskStatus.BLOCKED]: [
    TaskStatus.PLANNING,
    TaskStatus.DEVELOPMENT,
    TaskStatus.TESTING,
    TaskStatus.REPAIRING,
    TaskStatus.CANCELLED,
    TaskStatus.FAILED,
  ],
  [TaskStatus.COMPLETED]: [],
  [TaskStatus.FAILED]: [TaskStatus.QUEUED], // Allowed when restarting/retrying
  [TaskStatus.CANCELLED]: [TaskStatus.QUEUED], // Allowed when restarting/retrying
  [TaskStatus.TIMED_OUT]: [TaskStatus.QUEUED], // Allowed when restarting/retrying
};

export function isTerminalStatus(status: TaskStatusType): boolean {
  return TERMINAL_TASK_STATUSES.has(status);
}

export function isActiveStatus(status: TaskStatusType): boolean {
  return ACTIVE_TASK_STATUSES.has(status);
}

export function isErrorStatus(status: TaskStatusType): boolean {
  return ERROR_TASK_STATUSES.has(status);
}

export function getAllowedTransitions(status: TaskStatusType): readonly TaskStatusType[] {
  return ALLOWED_TASK_TRANSITIONS[status] ?? [];
}

export function canTransition(
  from: TaskStatusType,
  to: TaskStatusType,
  options: { allowRetry?: boolean } = {},
): boolean {
  if (from === to) {
    return true; // Idempotent self-transition
  }

  const allowed = getAllowedTransitions(from);
  if (allowed.includes(to)) {
    return true;
  }

  // Handle explicit retry out of terminal state
  if (options.allowRetry && isTerminalStatus(from) && to === TaskStatus.QUEUED) {
    return true;
  }

  return false;
}

export function validateTaskTransition(
  from: TaskStatusType,
  to: TaskStatusType,
  options: { allowRetry?: boolean } = {},
): TaskStatusType {
  if (!canTransition(from, to, options)) {
    throw new InvalidStateTransitionError(
      from,
      to,
      `Task cannot transition from "${from}" to "${to}". Allowed transitions are: [${getAllowedTransitions(
        from,
      ).join(', ')}]`,
    );
  }
  return to;
}
