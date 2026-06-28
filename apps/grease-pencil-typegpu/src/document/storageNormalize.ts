import { createInitialDocument } from './factory'
import type { GreaseDocument } from './model'
import { normalizeOnionSkinSettings } from './onionSkin'
import { normalizeMaterials } from './storageMaterialNormalize'
import { clamp01 } from './storageScalarNormalize'
import { normalizeDrawing } from './storageStrokeNormalize'
import type { StoredGreaseDocument } from './storageTypes'
import { sanitizeFrameNumber, sortFrames } from './frameNumbers'
import { normalizeWorkplane } from './workplane'

export function normalizeStoredDocument(
  document: StoredGreaseDocument,
): GreaseDocument {
  if (document.layers.length > 0) {
    const materials = normalizeMaterials(document.materials)
    const activeMaterial =
      materials.find((material) => material.id === document.activeMaterialId) ??
      materials[0]
    const activeLayer =
      document.layers.find((layer) => layer.id === document.activeLayerId) ??
      document.layers[document.layers.length - 1]

    return {
      ...document,
      currentFrame: sanitizeFrameNumber(document.currentFrame),
      activeLayerId: activeLayer?.id ?? document.activeLayerId,
      activeMaterialId: activeMaterial.id,
      workplane: normalizeWorkplane(document.workplane),
      onionSkin: normalizeOnionSkinSettings(document.onionSkin),
      layers: document.layers.map((layer) => ({
        ...layer,
        opacity: clamp01(layer.opacity),
        frames: sortFrames(layer.frames),
      })),
      drawings: document.drawings.map((drawing) =>
        normalizeDrawing(drawing, activeMaterial.id),
      ),
      materials,
    }
  }

  return createInitialDocument()
}
