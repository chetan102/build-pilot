export interface IdempotencyStore {
  setIfNotExists(key: string, value: string, ttlMs: number): Promise<boolean>;
  delete(key: string): Promise<boolean>;
  get(key: string): Promise<string | null>;
}

export class MemoryIdempotencyStore implements IdempotencyStore {
  private store = new Map<string, { value: string; expiresAt: number }>();

  async setIfNotExists(key: string, value: string, ttlMs: number): Promise<boolean> {
    const now = Date.now();
    const existing = this.store.get(key);
    if (existing && existing.expiresAt > now) {
      return false; // Key already exists and is active
    }

    this.store.set(key, { value, expiresAt: now + ttlMs });
    return true;
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async get(key: string): Promise<string | null> {
    const now = Date.now();
    const existing = this.store.get(key);
    if (!existing) return null;
    if (existing.expiresAt <= now) {
      this.store.delete(key);
      return null;
    }
    return existing.value;
  }

  clear(): void {
    this.store.clear();
  }
}

export class IdempotencyGuard {
  constructor(private store: IdempotencyStore = new MemoryIdempotencyStore()) {}

  async acquireLock(key: string, ttlMs = 60000): Promise<boolean> {
    return this.store.setIfNotExists(`lock:${key}`, 'locked', ttlMs);
  }

  async releaseLock(key: string): Promise<boolean> {
    return this.store.delete(`lock:${key}`);
  }

  async isProcessed(key: string): Promise<boolean> {
    const val = await this.store.get(`processed:${key}`);
    return val !== null;
  }

  async markProcessed(key: string, ttlMs = 86400000): Promise<boolean> {
    return this.store.setIfNotExists(`processed:${key}`, 'processed', ttlMs);
  }

  async runIdempotent<T>(
    key: string,
    operation: () => Promise<T>,
    options: { lockTtlMs?: number; processedTtlMs?: number } = {},
  ): Promise<{ executed: boolean; result?: T; duplicate?: boolean }> {
    const lockTtl = options.lockTtlMs || 60000;
    const processedTtl = options.processedTtlMs || 86400000;

    // Check if already processed
    if (await this.isProcessed(key)) {
      return { executed: false, duplicate: true };
    }

    // Attempt to acquire execution lock
    const acquired = await this.acquireLock(key, lockTtl);
    if (!acquired) {
      return { executed: false, duplicate: true };
    }

    try {
      const result = await operation();
      await this.markProcessed(key, processedTtl);
      return { executed: true, result, duplicate: false };
    } finally {
      await this.releaseLock(key);
    }
  }
}

export const globalIdempotencyGuard = new IdempotencyGuard();
