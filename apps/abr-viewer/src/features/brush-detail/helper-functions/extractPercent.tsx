export function extractPercent(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'value' in value) {
    return (value as { value: number }).value;
  }
  return 0;
}
