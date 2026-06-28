import type { Vec3, Vec4 } from '../shared/vector'

export function isVec3(value: unknown): value is Vec3 {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((item) => typeof item === 'number')
  )
}

export function isVec4(value: unknown): value is Vec4 {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((item) => typeof item === 'number')
  )
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
