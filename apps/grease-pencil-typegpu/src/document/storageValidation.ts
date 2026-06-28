import type { StoredGreaseDocument } from './storageTypes'
import {
  isDrawingGrid,
  isDrawingWorkplane,
  isGreaseLayer,
  isOnionSkinSettings,
  isStoredDrawing,
} from './storageDrawingValidation'
import { isStoredGreaseMaterial } from './storageMaterialValidation'
import { isRecord } from './storagePrimitiveValidation'

export {
  isMaterialFillStyle,
  isMaterialGradientType,
  isMaterialStrokeMode,
  isStrokeCapStyle,
  isStrokeJoinStyle,
} from './storageMaterialValidation'

export function isStoredGreaseDocument(
  value: unknown,
): value is StoredGreaseDocument {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.currentFrame === 'number' &&
    typeof value.activeLayerId === 'string' &&
    (!('activeMaterialId' in value) || typeof value.activeMaterialId === 'string') &&
    (!('activeWorkplaneId' in value) ||
      typeof value.activeWorkplaneId === 'string') &&
    (!('workplane' in value) || isDrawingWorkplane(value.workplane)) &&
    (!('workplanes' in value) ||
      (Array.isArray(value.workplanes) && value.workplanes.every(isDrawingGrid))) &&
    (!('onionSkin' in value) || isOnionSkinSettings(value.onionSkin)) &&
    Array.isArray(value.layers) &&
    value.layers.every(isGreaseLayer) &&
    Array.isArray(value.drawings) &&
    value.drawings.every(isStoredDrawing) &&
    (!('materials' in value) ||
      (Array.isArray(value.materials) && value.materials.every(isStoredGreaseMaterial)))
  )
}
