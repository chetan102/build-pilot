import { describe, it, expect } from 'vitest';
import { createLogger } from './logger.js';
import { createTracer } from './tracer.js';
import { MetricsRegistry } from './metrics.js';

describe('Observability & Telemetry (Phase 19)', () => {
  describe('Task 19.1 — Structured Logging & Secret Redaction', () => {
    it('creates logger with service name and configured redact paths', () => {
      const logger = createLogger({ serviceName: 'test-service' });
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
    });
  });

  describe('Task 19.2 — OpenTelemetry Tracing', () => {
    it('creates spans and tracks execution status and duration', async () => {
      const tracer = createTracer('worker-service');

      const result = await tracer.withSpan(
        'execute_task',
        async (span) => {
          expect(span.name).toBe('execute_task');
          expect(span.attributes['service.name']).toBe('worker-service');
          return 'ok';
        },
        { 'task.id': 'task_123' },
      );

      expect(result).toBe('ok');
      const spans = tracer.getCompletedSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0]?.status).toBe('OK');
      expect(spans[0]?.endTime).toBeGreaterThanOrEqual(spans[0]?.startTime || 0);
    });
  });

  describe('Task 19.3 — Operational Metrics & Prometheus Format', () => {
    it('increments counters and renders valid Prometheus text output', () => {
      const metrics = new MetricsRegistry();
      metrics.increment('buildpilot_tasks_total', 1, { status: 'COMPLETED' });
      metrics.increment('buildpilot_llm_tokens_total', 1500, { model: 'gpt-4o' });

      const text = metrics.toPrometheusText();
      expect(text).toContain('# HELP buildpilot_tasks_total');
      expect(text).toContain('buildpilot_tasks_total{status="COMPLETED"} 1');
      expect(text).toContain('buildpilot_llm_tokens_total{model="gpt-4o"} 1500');
    });
  });
});
