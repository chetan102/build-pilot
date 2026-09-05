import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';

describe('API Health Check', () => {
  it('returns 200 OK for /health', async () => {
    const app = createApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('control-api');
  });

  it('sets x-correlation-id in response headers', async () => {
    const app = createApp();
    const res = await request(app).get('/health');
    expect(res.headers['x-correlation-id']).toBeDefined();
  });
});

