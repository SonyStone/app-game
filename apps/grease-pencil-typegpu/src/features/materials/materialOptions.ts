import {
  materialFillStyles,
  materialGradientTypes,
  materialStrokeModes,
  strokeCapStyles,
  strokeJoinStyles,
  type MaterialFillStyle,
  type MaterialGradientType,
  type MaterialStrokeMode,
  type StrokeCapStyle,
  type StrokeJoinStyle,
} from '../../document'

export const capStyleLabels = {
  round: 'Round',
  flat: 'Flat',
  square: 'Square',
} satisfies Record<StrokeCapStyle, string>

export const joinStyleLabels = {
  round: 'Round',
  bevel: 'Bevel',
  miter: 'Miter',
} satisfies Record<StrokeJoinStyle, string>

export const materialStrokeModeLabels = {
  line: 'Line',
  dot: 'Dots',
  square: 'Squares',
} satisfies Record<MaterialStrokeMode, string>

export const materialFillStyleLabels = {
  solid: 'Solid',
  gradient: 'Gradient',
} satisfies Record<MaterialFillStyle, string>

export const materialGradientTypeLabels = {
  linear: 'Linear',
  radial: 'Radial',
} satisfies Record<MaterialGradientType, string>

export function readStrokeCapStyle(value: string): StrokeCapStyle {
  return strokeCapStyles.find((capStyle) => capStyle === value) ?? 'round'
}

export function readStrokeJoinStyle(value: string): StrokeJoinStyle {
  return strokeJoinStyles.find((joinStyle) => joinStyle === value) ?? 'round'
}

export function readMaterialStrokeMode(value: string): MaterialStrokeMode {
  return materialStrokeModes.find((strokeMode) => strokeMode === value) ?? 'line'
}

export function readMaterialFillStyle(value: string): MaterialFillStyle {
  return materialFillStyles.find((fillStyle) => fillStyle === value) ?? 'solid'
}

export function readMaterialGradientType(value: string): MaterialGradientType {
  return materialGradientTypes.find((gradientType) => gradientType === value) ?? 'linear'
}
