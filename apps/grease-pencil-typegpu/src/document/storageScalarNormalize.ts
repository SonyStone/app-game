export function sanitizeStrokeRadius(value: number) {
  if (!Number.isFinite(value)) return 0.045
  return Math.max(0.002, Math.min(0.4, value))
}

export function sanitizePointRadius(value: number) {
  return sanitizeStrokeRadius(value)
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export function clamp01(value: number) {
  if (!Number.isFinite(value)) return 1
  return clamp(value, 0, 1)
}
