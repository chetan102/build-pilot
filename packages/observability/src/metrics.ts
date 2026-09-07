export interface MetricRecord {
  name: string;
  type: 'counter' | 'gauge' | 'histogram';
  help: string;
  values: Array<{
    labels: Record<string, string>;
    value: number;
    timestamp?: number;
  }>;
}

export class MetricsRegistry {
  private metrics = new Map<string, MetricRecord>();

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults(): void {
    this.register('buildpilot_tasks_total', 'counter', 'Total number of tasks created and executed');
    this.register('buildpilot_task_duration_seconds', 'histogram', 'Duration of task runs in seconds');
    this.register('buildpilot_tool_executions_total', 'counter', 'Total tool calls executed');
    this.register('buildpilot_llm_tokens_total', 'counter', 'Total LLM token usage');
    this.register('buildpilot_llm_cost_usd_total', 'counter', 'Estimated LLM cost in USD');
  }

  register(name: string, type: 'counter' | 'gauge' | 'histogram', help: string): void {
    this.metrics.set(name, { name, type, help, values: [] });
  }

  increment(name: string, value = 1, labels: Record<string, string> = {}): void {
    const metric = this.metrics.get(name);
    if (!metric) return;

    const existing = metric.values.find((v) => this.labelsMatch(v.labels, labels));
    if (existing) {
      existing.value += value;
    } else {
      metric.values.push({ labels, value });
    }
  }

  observe(name: string, value: number, labels: Record<string, string> = {}): void {
    const metric = this.metrics.get(name);
    if (!metric) return;
    metric.values.push({ labels, value, timestamp: Date.now() });
  }

  private labelsMatch(a: Record<string, string>, b: Record<string, string>): boolean {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((k) => a[k] === b[k]);
  }

  toPrometheusText(): string {
    const lines: string[] = [];

    for (const metric of this.metrics.values()) {
      lines.push(`# HELP ${metric.name} ${metric.help}`);
      lines.push(`# TYPE ${metric.name} ${metric.type}`);

      if (metric.values.length === 0) {
        lines.push(`${metric.name} 0`);
      } else {
        for (const v of metric.values) {
          const labelEntries = Object.entries(v.labels);
          const labelStr =
            labelEntries.length > 0
              ? `{${labelEntries.map(([k, val]) => `${k}="${val}"`).join(',')}}`
              : '';
          lines.push(`${metric.name}${labelStr} ${v.value}`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}

export const metricsRegistry = new MetricsRegistry();
