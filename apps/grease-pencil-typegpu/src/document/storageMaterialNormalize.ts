import { copyVec4 } from './geometry'
import { createDefaultMaterials } from './materials'
import type {
  GreaseMaterial,
  MaterialFillStyle,
  MaterialGradientType,
  MaterialStrokeMode,
  StrokeCapStyle,
  StrokeJoinStyle,
} from './model'
import {
  isMaterialFillStyle,
  isMaterialGradientType,
  isMaterialStrokeMode,
  isStrokeCapStyle,
  isStrokeJoinStyle,
} from './storageValidation'
import { sanitizeStrokeRadius } from './storageScalarNormalize'
import type { StoredGreaseMaterial } from './storageTypes'

export function normalizeMaterials(
  materials: StoredGreaseMaterial[] | undefined,
): [GreaseMaterial, ...GreaseMaterial[]] {
  const defaults = createDefaultMaterials()
  if (!materials || materials.length === 0) return defaults

  const normalized = materials
    .filter(isStoredGreaseMaterial)
    .map((material) => ({
      ...material,
      strokeColor: copyVec4(material.strokeColor),
      fillColor: copyVec4(material.fillColor),
      mixColor: copyVec4(material.mixColor ?? material.fillColor),
      strokeRadius: sanitizeStrokeRadius(material.strokeRadius),
      capStyle: normalizeStrokeCapStyle(material.capStyle),
      joinStyle: normalizeStrokeJoinStyle(material.joinStyle),
      strokeMode: normalizeMaterialStrokeMode(material.strokeMode),
      fillStyle: normalizeMaterialFillStyle(material.fillStyle),
      gradientType: normalizeMaterialGradientType(material.gradientType),
    }))

  const firstMaterial = normalized[0]
  if (!firstMaterial) return defaults

  return [firstMaterial, ...normalized.slice(1)]
}

function normalizeStrokeCapStyle(
  value: StrokeCapStyle | undefined,
): StrokeCapStyle {
  return value && isStrokeCapStyle(value) ? value : 'round'
}

function normalizeStrokeJoinStyle(
  value: StrokeJoinStyle | undefined,
): StrokeJoinStyle {
  return value && isStrokeJoinStyle(value) ? value : 'round'
}

function normalizeMaterialStrokeMode(
  value: MaterialStrokeMode | undefined,
): MaterialStrokeMode {
  return value && isMaterialStrokeMode(value) ? value : 'line'
}

function normalizeMaterialFillStyle(
  value: MaterialFillStyle | undefined,
): MaterialFillStyle {
  return value && isMaterialFillStyle(value) ? value : 'solid'
}

function normalizeMaterialGradientType(
  value: MaterialGradientType | undefined,
): MaterialGradientType {
  return value && isMaterialGradientType(value) ? value : 'linear'
}

function isStoredGreaseMaterial(
  material: StoredGreaseMaterial,
): material is StoredGreaseMaterial {
  return Boolean(material)
}
