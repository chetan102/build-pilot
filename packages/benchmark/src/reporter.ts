import { BenchmarkSuiteResult } from './runner.js';

export class BenchmarkReporter {
  static formatMarkdownReport(results: BenchmarkSuiteResult[]): string {
    const lines: string[] = [];

    lines.push('# BuildPilot Autonomous Engineering Benchmark Report');
    lines.push('');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push('');
    lines.push('| Provider / Model | Pass Rate | Passed / Total | Duration (s) | Total Tokens | Est. Cost ($) |');
    lines.push('| :--- | :--- | :--- | :--- | :--- | :--- |');

    for (const r of results) {
      const durationSec = (r.totalDurationMs / 1000).toFixed(1);
      lines.push(
        `| **${r.provider}** (${r.model}) | **${r.passRate}%** | ${r.passedTasks}/${r.totalTasks} | ${durationSec}s | ${r.totalTokensUsed.toLocaleString()} | $${r.totalCostUsd.toFixed(4)} |`,
      );
    }

    lines.push('');
    lines.push('### Detailed Breakdown by Category');
    lines.push('');

    for (const r of results) {
      lines.push(`#### Model: ${r.model}`);
      for (const t of r.results) {
        const icon = t.passed ? '✅' : '❌';
        lines.push(`- ${icon} **${t.taskId}** [${t.category}] — ${t.durationMs}ms, ${t.tokensUsed} tokens`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}
