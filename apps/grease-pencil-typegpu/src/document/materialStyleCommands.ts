import type {
  GreaseDocument,
  MaterialFillStyle,
  MaterialGradientType,
  MaterialStrokeMode,
  StrokeCapStyle,
  StrokeJoinStyle,
} from './model'
import { replaceActiveMaterial } from './materialUpdate'

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
