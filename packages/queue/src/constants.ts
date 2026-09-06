export const ENGINEERING_TASK_QUEUE = 'engineering-task';

export const TASK_EXECUTION_JOB = 'task:execute';

export const DEFAULT_WORKER_CONCURRENCY = 5;

export const DEFAULT_JOB_ATTEMPTS = 3;

export const DEFAULT_BACKOFF_DELAY_MS = 5000;

export const DEFAULT_JOB_OPTIONS = {
  attempts: DEFAULT_JOB_ATTEMPTS,
  backoff: {
    type: 'exponential',
    delay: DEFAULT_BACKOFF_DELAY_MS,
  },
  removeOnComplete: {
    count: 1000,
    age: 24 * 3600, // keep for 24 hours
  },
  removeOnFail: {
    count: 5000, // keep dead-letter / failed jobs for post-mortem analysis
  },
} as const;

