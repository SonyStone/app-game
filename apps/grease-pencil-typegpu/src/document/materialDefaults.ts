import { createMaterialId } from './ids'
import type { GreaseMaterial } from './model'

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
