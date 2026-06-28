import type { Vec4 } from '../shared/vector'
import { copyVec4 } from './geometry'
import type { GreaseDocument } from './model'
import {
  replaceActiveMaterial,
  sanitizeMaterialStrokeRadius,
} from './materialUpdate'

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
    strokeRadius: sanitizeMaterialStrokeRadius(strokeRadius),
  }))
}
