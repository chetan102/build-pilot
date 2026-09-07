export interface SpanAttributes {
  [key: string]: string | number | boolean | undefined;
}

export interface Span {
  name: string;
  attributes: SpanAttributes;
  startTime: number;
  endTime?: number;
  status: 'OK' | 'ERROR';
  errorMessage?: string;
}

export class BuildPilotTracer {
  private serviceName: string;
  private activeSpans: Span[] = [];

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  startSpan(name: string, attributes: SpanAttributes = {}): Span {
    const span: Span = {
      name,
      attributes: {
        'service.name': this.serviceName,
        ...attributes,
      },
      startTime: Date.now(),
      status: 'OK',
    };
    this.activeSpans.push(span);
    return span;
  }

  endSpan(span: Span, error?: Error): void {
    span.endTime = Date.now();
    if (error) {
      span.status = 'ERROR';
      span.errorMessage = error.message;
    }
  }

  async withSpan<T>(
    name: string,
    fn: (span: Span) => Promise<T>,
    attributes: SpanAttributes = {},
  ): Promise<T> {
    const span = this.startSpan(name, attributes);
    try {
      const result = await fn(span);
      this.endSpan(span);
      return result;
    } catch (err: any) {
      this.endSpan(span, err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  getCompletedSpans(): Span[] {
    return this.activeSpans.filter((s) => s.endTime !== undefined);
  }
}

export function createTracer(serviceName: string): BuildPilotTracer {
  return new BuildPilotTracer(serviceName);
}
