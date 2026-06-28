import type {
  GreaseDocument,
  GreaseMaterial,
} from './model'
import { createDefaultMaterials } from './materialDefaults'

export function getActiveMaterial(document: GreaseDocument): GreaseMaterial {
  return (
    document.materials.find((material) => material.id === document.activeMaterialId) ??
    document.materials[0] ??
    createDefaultMaterials()[0]
  )
}
