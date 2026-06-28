import { createDocumentId } from './ids'
import { createDefaultMaterials } from './materials'
import { createDefaultOnionSkinSettings } from './onionSkin'
import { createDrawing, createLayer } from './documentFactories'
import { DEFAULT_FRAME_NUMBER } from './frameNumbers'
import {
  createDefaultWorkplane,
  createDrawingGrid,
} from './workplane'
import type { GreaseDocument } from './model'

export function createInitialDocument(): GreaseDocument {
  const drawing = createDrawing()
  const layer = createLayer('Lines', DEFAULT_FRAME_NUMBER, drawing.id)
  const materials = createDefaultMaterials()
  const activeMaterial = materials[0]
  const workplane = createDefaultWorkplane()
  const workplaneGrid = createDrawingGrid('Grid 1', workplane)

  return {
    id: createDocumentId(),
    name: 'Untitled Grease Pencil',
    currentFrame: DEFAULT_FRAME_NUMBER,
    activeLayerId: layer.id,
    activeMaterialId: activeMaterial.id,
    activeWorkplaneId: workplaneGrid.id,
    workplane,
    workplanes: [workplaneGrid],
    onionSkin: createDefaultOnionSkinSettings(),
    layers: [layer],
    drawings: [drawing],
    materials,
  }
}
