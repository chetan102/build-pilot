import { describe, it, expect } from 'vitest';
import {
  TaskStatus,
  TaskStatusType,
  canTransition,
  validateTaskTransition,
  isTerminalStatus,
  isActiveStatus,
  isErrorStatus,
  getAllowedTransitions,
  InvalidStateTransitionError,
} from './index.js';

describe('State Machine & Transitions', () => {
  describe('Standard Happy Path Lifecycle', () => {
    it('allows full progression from QUEUED to COMPLETED', () => {
      let current: TaskStatusType = TaskStatus.QUEUED;

      current = validateTaskTransition(current, TaskStatus.PLANNING);
      expect(current).toBe(TaskStatus.PLANNING);

      current = validateTaskTransition(current, TaskStatus.READY_FOR_DEVELOPMENT);
      expect(current).toBe(TaskStatus.READY_FOR_DEVELOPMENT);

      current = validateTaskTransition(current, TaskStatus.DEVELOPMENT);
      expect(current).toBe(TaskStatus.DEVELOPMENT);

      current = validateTaskTransition(current, TaskStatus.TESTING);
      expect(current).toBe(TaskStatus.TESTING);

      current = validateTaskTransition(current, TaskStatus.REVIEW);
      expect(current).toBe(TaskStatus.REVIEW);

      current = validateTaskTransition(current, TaskStatus.PR_READY);
      expect(current).toBe(TaskStatus.PR_READY);

      current = validateTaskTransition(current, TaskStatus.COMPLETED);
      expect(current).toBe(TaskStatus.COMPLETED);
    });
  });

  describe('Testing, Repair, and Review Transitions', () => {
    it('allows test failure transition to REPAIRING and back to TESTING / DEVELOPMENT', () => {
      expect(canTransition(TaskStatus.TESTING, TaskStatus.REPAIRING)).toBe(true);
      expect(canTransition(TaskStatus.REPAIRING, TaskStatus.DEVELOPMENT)).toBe(true);
      expect(canTransition(TaskStatus.REPAIRING, TaskStatus.TESTING)).toBe(true);

      const next = validateTaskTransition(TaskStatus.TESTING, TaskStatus.REPAIRING);
      expect(next).toBe(TaskStatus.REPAIRING);
    });

    it('allows review changes requested loop', () => {
      expect(canTransition(TaskStatus.REVIEW, TaskStatus.CHANGES_REQUESTED)).toBe(true);
      expect(canTransition(TaskStatus.CHANGES_REQUESTED, TaskStatus.REPAIRING)).toBe(true);
    });

    it('allows human approval transitions', () => {
      expect(canTransition(TaskStatus.REVIEW, TaskStatus.AWAITING_APPROVAL)).toBe(true);
      expect(canTransition(TaskStatus.DEVELOPMENT, TaskStatus.AWAITING_APPROVAL)).toBe(true);
      expect(canTransition(TaskStatus.AWAITING_APPROVAL, TaskStatus.PR_READY)).toBe(true);
      expect(canTransition(TaskStatus.AWAITING_APPROVAL, TaskStatus.DEVELOPMENT)).toBe(true);
      expect(canTransition(TaskStatus.AWAITING_APPROVAL, TaskStatus.REPAIRING)).toBe(true);
    });
  });

  describe('Cancellation, Failure, and Terminal States', () => {
    it('allows cancellation from active states', () => {
      expect(canTransition(TaskStatus.QUEUED, TaskStatus.CANCELLED)).toBe(true);
      expect(canTransition(TaskStatus.PLANNING, TaskStatus.CANCELLED)).toBe(true);
      expect(canTransition(TaskStatus.DEVELOPMENT, TaskStatus.CANCELLED)).toBe(true);
      expect(canTransition(TaskStatus.TESTING, TaskStatus.CANCELLED)).toBe(true);
      expect(canTransition(TaskStatus.REVIEW, TaskStatus.CANCELLED)).toBe(true);
    });

    it('allows failure from active states', () => {
      expect(canTransition(TaskStatus.PLANNING, TaskStatus.FAILED)).toBe(true);
      expect(canTransition(TaskStatus.DEVELOPMENT, TaskStatus.FAILED)).toBe(true);
      expect(canTransition(TaskStatus.TESTING, TaskStatus.FAILED)).toBe(true);
      expect(canTransition(TaskStatus.REVIEW, TaskStatus.FAILED)).toBe(true);
    });

    it('identifies terminal states correctly', () => {
      expect(isTerminalStatus(TaskStatus.COMPLETED)).toBe(true);
      expect(isTerminalStatus(TaskStatus.FAILED)).toBe(true);
      expect(isTerminalStatus(TaskStatus.CANCELLED)).toBe(true);
      expect(isTerminalStatus(TaskStatus.TIMED_OUT)).toBe(true);

      expect(isTerminalStatus(TaskStatus.QUEUED)).toBe(false);
      expect(isTerminalStatus(TaskStatus.DEVELOPMENT)).toBe(false);
      expect(isTerminalStatus(TaskStatus.TESTING)).toBe(false);
    });

    it('identifies active states correctly', () => {
      expect(isActiveStatus(TaskStatus.PLANNING)).toBe(true);
      expect(isActiveStatus(TaskStatus.DEVELOPMENT)).toBe(true);
      expect(isActiveStatus(TaskStatus.TESTING)).toBe(true);
      expect(isActiveStatus(TaskStatus.REPAIRING)).toBe(true);
      expect(isActiveStatus(TaskStatus.AWAITING_APPROVAL)).toBe(true);
      expect(isActiveStatus(TaskStatus.COMPLETED)).toBe(false);
    });

    it('identifies error states correctly', () => {
      expect(isErrorStatus(TaskStatus.FAILED)).toBe(true);
      expect(isErrorStatus(TaskStatus.CANCELLED)).toBe(true);
      expect(isErrorStatus(TaskStatus.BLOCKED)).toBe(true);
      expect(isErrorStatus(TaskStatus.TIMED_OUT)).toBe(true);
      expect(isErrorStatus(TaskStatus.DEVELOPMENT)).toBe(false);
    });

    it('allows retry from terminal states only when allowRetry is enabled', () => {
      expect(canTransition(TaskStatus.FAILED, TaskStatus.QUEUED, { allowRetry: true })).toBe(true);
      expect(canTransition(TaskStatus.CANCELLED, TaskStatus.QUEUED, { allowRetry: true })).toBe(true);
      expect(canTransition(TaskStatus.COMPLETED, TaskStatus.QUEUED)).toBe(false);
    });
  });

  describe('Illegal Transitions & Strict Validation', () => {
    it('is idempotent for identical state', () => {
      expect(canTransition(TaskStatus.DEVELOPMENT, TaskStatus.DEVELOPMENT)).toBe(true);
      expect(validateTaskTransition(TaskStatus.DEVELOPMENT, TaskStatus.DEVELOPMENT)).toBe(
        TaskStatus.DEVELOPMENT,
      );
    });

    it('throws InvalidStateTransitionError on illegal transitions', () => {
      // Skipping directly from QUEUED to COMPLETED
      expect(() => validateTaskTransition(TaskStatus.QUEUED, TaskStatus.COMPLETED)).toThrow(
        InvalidStateTransitionError,
      );

      // Transitioning out of COMPLETED
      expect(() => validateTaskTransition(TaskStatus.COMPLETED, TaskStatus.PLANNING)).toThrow(
        InvalidStateTransitionError,
      );

      // Skipping from DEVELOPMENT directly to COMPLETED without testing/review/PR
      expect(() => validateTaskTransition(TaskStatus.DEVELOPMENT, TaskStatus.COMPLETED)).toThrow(
        InvalidStateTransitionError,
      );

      // Skipping from QUEUED directly to TESTING
      expect(() => validateTaskTransition(TaskStatus.QUEUED, TaskStatus.TESTING)).toThrow(
        InvalidStateTransitionError,
      );
    });

    it('provides clear error message listing allowed targets', () => {
      try {
        validateTaskTransition(TaskStatus.QUEUED, TaskStatus.COMPLETED);
        expect.unreachable('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(InvalidStateTransitionError);
        const err = e as InvalidStateTransitionError;
        expect(err.fromStatus).toBe(TaskStatus.QUEUED);
        expect(err.toStatus).toBe(TaskStatus.COMPLETED);
        expect(err.message).toContain('Allowed transitions are:');
        expect(err.message).toContain('PLANNING');
      }
    });

    it('returns empty array of allowed transitions for COMPLETED', () => {
      expect(getAllowedTransitions(TaskStatus.COMPLETED)).toEqual([]);
    });
  });
});
