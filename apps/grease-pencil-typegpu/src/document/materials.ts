import type { Vec4 } from '../render/math'
import { createMaterialId } from './ids'
import { copyVec4 } from './geometry'
import type {
  GreaseDocument,
  GreaseMaterial,
  MaterialFillStyle,
  MaterialGradientType,
  MaterialId,
  MaterialStrokeMode,
  StrokeCapStyle,
  StrokeJoinStyle,
} from './model'

export function getActiveMaterial(document: GreaseDocument): GreaseMaterial {
  return (
    document.materials.find((material) => material.id === document.activeMaterialId) ??
    document.materials[0] ??
    createDefaultMaterials()[0]
  )
}

export function setActiveMaterial(
  document: GreaseDocument,
  materialId: MaterialId,
): GreaseDocument {
  if (!document.materials.some((material) => material.id === materialId)) {
    return document
  }

  return {
    ...document,
    activeMaterialId: materialId,
  }
}

export function setActiveMaterialStrokeColor(
  document: GreaseDocument,
  strokeColor: Vec4,
): GreaseDocument {
  return replaceActiveMaterial(document, (material) => ({
    ...material,
    strokeColor: copyVec4(strokeColor),
  }))
}

export function setActiveMaterialFillColor(
  document: GreaseDocument,
  fillColor: Vec4,
): GreaseDocument {
  return replaceActiveMaterial(document, (material) => ({
    ...material,
    fillColor: copyVec4(fillColor),
  }))
}

export function setActiveMaterialMixColor(
  document: GreaseDocument,
  mixColor: Vec4,
): GreaseDocument {
  return replaceActiveMaterial(document, (material) => ({
    ...material,
    mixColor: copyVec4(mixColor),
  }))
}

export function setActiveMaterialStrokeRadius(
  document: GreaseDocument,
  strokeRadius: number,
): GreaseDocument {
  return replaceActiveMaterial(document, (material) => ({
    ...material,
    strokeRadius: sanitizeStrokeRadius(strokeRadius),
  }))
}

export function setActiveMaterialUseFill(
  document: GreaseDocument,
  useFill: boolean,
): GreaseDocument {
  return replaceActiveMaterial(document, (material) => ({
    ...material,
    useFill,
  }))
}

export function setActiveMaterialUseStroke(
  document: GreaseDocument,
  useStroke: boolean,
): GreaseDocument {
  return replaceActiveMaterial(document, (material) => ({
    ...material,
    useStroke,
  }))
}

export function setActiveMaterialCapStyle(
  document: GreaseDocument,
  capStyle: StrokeCapStyle,
): GreaseDocument {
  return replaceActiveMaterial(document, (material) => ({
    ...material,
    capStyle,
  }))
}

export function setActiveMaterialJoinStyle(
  document: GreaseDocument,
  joinStyle: StrokeJoinStyle,
): GreaseDocument {
  return replaceActiveMaterial(document, (material) => ({
    ...material,
    joinStyle,
  }))
}

export function setActiveMaterialStrokeMode(
  document: GreaseDocument,
  strokeMode: MaterialStrokeMode,
): GreaseDocument {
  return replaceActiveMaterial(document, (material) => ({
    ...material,
    strokeMode,
  }))
}

export function setActiveMaterialFillStyle(
  document: GreaseDocument,
  fillStyle: MaterialFillStyle,
): GreaseDocument {
  return replaceActiveMaterial(document, (material) => ({
    ...material,
    fillStyle,
  }))
}

export function setActiveMaterialGradientType(
  document: GreaseDocument,
  gradientType: MaterialGradientType,
): GreaseDocument {
  return replaceActiveMaterial(document, (material) => ({
    ...material,
    gradientType,
  }))
}

export function createDefaultMaterials(): [GreaseMaterial, GreaseMaterial] {
  return [
    {
      id: createMaterialId(),
      name: 'Ink',
      strokeColor: [0.045, 0.044, 0.04, 1],
      fillColor: [0.9, 0.88, 0.78, 0.58],
      mixColor: [0.98, 0.7, 0.24, 0.5],
      strokeRadius: 0.045,
      useStroke: true,
      useFill: true,
      capStyle: 'round',
      joinStyle: 'round',
      strokeMode: 'line',
      fillStyle: 'solid',
      gradientType: 'linear',
    },
    {
      id: createMaterialId(),
      name: 'Wash',
      strokeColor: [0.05, 0.32, 0.92, 1],
      fillColor: [0.05, 0.32, 0.92, 0.28],
      mixColor: [0.05, 0.72, 0.38, 0.32],
      strokeRadius: 0.028,
      useStroke: true,
      useFill: true,
      capStyle: 'round',
      joinStyle: 'round',
      strokeMode: 'line',
      fillStyle: 'solid',
      gradientType: 'linear',
    },
  ]
}

function replaceActiveMaterial(
  document: GreaseDocument,
  updater: (material: GreaseMaterial) => GreaseMaterial,
): GreaseDocument {
  return {
    ...document,
    materials: document.materials.map((material) =>
      material.id === document.activeMaterialId ? updater(material) : material,
    ),
  }
}

function sanitizeStrokeRadius(value: number) {
  if (!Number.isFinite(value)) return 0.045
  return Math.max(0.002, Math.min(0.4, value))
}
