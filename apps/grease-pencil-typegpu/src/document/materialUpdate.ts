import type {
  GreaseDocument,
  GreaseMaterial,
} from './model'

export function replaceActiveMaterial(
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

export function sanitizeMaterialStrokeRadius(value: number) {
  if (!Number.isFinite(value)) return 0.045
  return Math.max(0.002, Math.min(0.4, value))
}
