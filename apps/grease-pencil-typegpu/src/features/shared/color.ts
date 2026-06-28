import type { Vec4 } from '../../shared/vector'

export type ColorOption = {
  name: string
  value: Vec4
  swatch: string
}

export const colorOptions = [
  { name: 'Ink', value: [0.045, 0.044, 0.04, 1], swatch: '#11100f' },
  { name: 'Red', value: [0.88, 0.18, 0.16, 1], swatch: '#dc302b' },
  { name: 'Blue', value: [0.05, 0.32, 0.92, 1], swatch: '#175de8' },
  { name: 'Green', value: [0.02, 0.52, 0.28, 1], swatch: '#148647' },
] satisfies ColorOption[]

export function sameVec4(a: Vec4, b: Vec4) {
  return (
    Math.abs(a[0] - b[0]) < 0.001 &&
    Math.abs(a[1] - b[1]) < 0.001 &&
    Math.abs(a[2] - b[2]) < 0.001 &&
    Math.abs(a[3] - b[3]) < 0.001
  )
}

export function sameRgb(a: Vec4, b: Vec4) {
  return (
    Math.abs(a[0] - b[0]) < 0.001 &&
    Math.abs(a[1] - b[1]) < 0.001 &&
    Math.abs(a[2] - b[2]) < 0.001
  )
}

export function withAlpha(color: Vec4, alpha: number): Vec4 {
  return [color[0], color[1], color[2], alpha]
}

export function copyVec4(color: Vec4): Vec4 {
  return [color[0], color[1], color[2], color[3]]
}

export function vec4ToCss(color: Vec4) {
  return `rgb(${Math.round(color[0] * 255)} ${Math.round(color[1] * 255)} ${Math.round(color[2] * 255)} / ${color[3]})`
}
