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
} from './model'
import type { StoredGreaseMaterial } from './storageTypes'
import {
  isRecord,
  isVec4,
} from './storagePrimitiveValidation'

export function isStrokeCapStyle(value: unknown): value is StrokeCapStyle {
  return isStringMember(value, strokeCapStyles)
}

export function isStrokeJoinStyle(value: unknown): value is StrokeJoinStyle {
  return isStringMember(value, strokeJoinStyles)
}

export function isMaterialStrokeMode(value: unknown): value is MaterialStrokeMode {
  return isStringMember(value, materialStrokeModes)
}

export function isMaterialFillStyle(value: unknown): value is MaterialFillStyle {
  return isStringMember(value, materialFillStyles)
}

export function isMaterialGradientType(
  value: unknown,
): value is MaterialGradientType {
  return isStringMember(value, materialGradientTypes)
}

export function isStoredGreaseMaterial(
  value: unknown,
): value is StoredGreaseMaterial {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isVec4(value.strokeColor) &&
    isVec4(value.fillColor) &&
    (!('mixColor' in value) || isVec4(value.mixColor)) &&
    typeof value.strokeRadius === 'number' &&
    typeof value.useStroke === 'boolean' &&
    typeof value.useFill === 'boolean' &&
    (!('capStyle' in value) || isStrokeCapStyle(value.capStyle)) &&
    (!('joinStyle' in value) || isStrokeJoinStyle(value.joinStyle)) &&
    (!('strokeMode' in value) || isMaterialStrokeMode(value.strokeMode)) &&
    (!('fillStyle' in value) || isMaterialFillStyle(value.fillStyle)) &&
    (!('gradientType' in value) || isMaterialGradientType(value.gradientType))
  )
}

function isStringMember<const Values extends readonly string[]>(
  value: unknown,
  values: Values,
): value is Values[number] {
  const stringValues: readonly string[] = values
  return typeof value === 'string' && stringValues.includes(value)
}
