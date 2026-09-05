export function formatTimestamp(date: Date = new Date()): string {
  return date.toISOString();
}

export function generateCorrelationId(prefix = 'bp'): string {
  return `${prefix}_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;
}
