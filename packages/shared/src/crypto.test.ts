import { describe, it, expect } from 'vitest';
import { SecretsManager } from './crypto.js';

describe('Secrets Management & Encryption (Task 21.2)', () => {
  it('encrypts and decrypts sensitive values accurately using AES-256-GCM', () => {
    const manager = new SecretsManager('custom-test-encryption-key-12345');
    const secret = 'sk-or-v1-my-sensitive-llm-api-key';

    const encrypted = manager.encrypt(secret);
    expect(encrypted).not.toBe(secret);
    expect(encrypted).toContain(':');

    const decrypted = manager.decrypt(encrypted);
    expect(decrypted).toBe(secret);
  });

  it('fails to decrypt tampered ciphertext', () => {
    const manager = new SecretsManager('custom-test-encryption-key-12345');
    const secret = 'my-token';
    const encrypted = manager.encrypt(secret);

    const tampered = encrypted.slice(0, -4) + 'abcd';
    expect(() => manager.decrypt(tampered)).toThrow();
  });
});
