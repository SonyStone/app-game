import type {
  GreaseDocument,
  MaterialId,
} from './model'

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
