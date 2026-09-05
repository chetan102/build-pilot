import { describe, it, expect } from 'vitest';
import { createApp } from './app.js';
import { EventEmitter } from 'events';

describe('API Health Check', () => {
  it('returns 200 OK for /health with correlation ID', async () => {
    const app = createApp();
    const req = Object.assign(new EventEmitter(), {
      method: 'GET',
      url: '/health',
      headers: {},
    });

    let statusCode = 200;
    let responseBody: any = null;
    const responseHeaders: Record<string, string> = {};

    const res = Object.assign(new EventEmitter(), {
      setHeader(name: string, value: string) {
        responseHeaders[name.toLowerCase()] = value;
      },
      getHeader(name: string) {
        return responseHeaders[name.toLowerCase()];
      },
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(data: any) {
        responseBody = data;
        return this;
      },
      send(data: any) {
        responseBody = data;
        return this;
      },
      end() {
        return this;
      },
    });

    app(req as any, res as any);

    expect(statusCode).toBe(200);
    expect(responseBody).toBeDefined();
    expect(responseBody.status).toBe('ok');
    expect(responseBody.service).toBe('control-api');
    expect(responseHeaders['x-correlation-id']).toBeDefined();
  });
});
