import { describe, it, expect, vi } from 'vitest';
import { BENCHMARK_TASKS } from './tasks.js';
import { BenchmarkRunner } from './runner.js';
import { BenchmarkReporter } from './reporter.js';
import { MockLLMProvider } from '@buildpilot/llm';
import { ToolRegistry } from '@buildpilot/tools';

describe('Evaluation & Benchmark Harness (Phase 20)', () => {
  describe('Task 20.1 — Benchmark Task Suite', () => {
    it('defines deterministic coding tasks across bug fixes and features', () => {
      expect(BENCHMARK_TASKS.length).toBeGreaterThanOrEqual(5);
      for (const t of BENCHMARK_TASKS) {
        expect(t.id).toBeDefined();
        expect(t.category).toBeDefined();
        expect(t.initialFiles).toBeDefined();
        expect(t.testScript).toBeDefined();
      }
    });
  });

  describe('Task 20.2 — Automated Benchmark Runner', () => {
    it('executes task suite and aggregates metrics', async () => {
      const mockProvider = new MockLLMProvider('mock:claude', {
        providerType: 'MOCK',
        defaultModel: 'claude-3.5-sonnet',
      });
      const tools = new ToolRegistry();
      const runner = new BenchmarkRunner();

      const suiteResult = await runner.runSuite(BENCHMARK_TASKS.slice(0, 2), mockProvider, tools);

      expect(suiteResult.totalTasks).toBe(2);
      expect(suiteResult.passedTasks).toBe(2);
      expect(suiteResult.passRate).toBe(100);
      expect(suiteResult.totalTokensUsed).toBeGreaterThan(0);
      expect(suiteResult.results).toHaveLength(2);
    });
  });

  describe('Task 20.3 — Evaluation Dashboard & Report', () => {
    it('generates structured markdown comparison report', async () => {
      const mockProvider = new MockLLMProvider('mock:gpt4o', {
        providerType: 'OPENAI',
        defaultModel: 'gpt-4o',
      });
      const tools = new ToolRegistry();
      const runner = new BenchmarkRunner();

      const suiteResult = await runner.runSuite(BENCHMARK_TASKS.slice(0, 2), mockProvider, tools, 'gpt-4o');
      const markdown = BenchmarkReporter.formatMarkdownReport([suiteResult]);

      expect(markdown).toContain('# BuildPilot Autonomous Engineering Benchmark Report');
      expect(markdown).toContain('gpt-4o');
      expect(markdown).toContain('100%');
    });
  });
});
