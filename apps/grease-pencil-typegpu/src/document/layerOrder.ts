import type { GreaseLayer } from './model'

export function swapLayers(
  layers: readonly GreaseLayer[],
  firstIndex: number,
  secondIndex: number,
) {
  const firstLayer = layers[firstIndex]
  const secondLayer = layers[secondIndex]
  if (!firstLayer || !secondLayer) return [...layers]

  const nextLayers = [...layers]
  nextLayers[firstIndex] = secondLayer
  nextLayers[secondIndex] = firstLayer
  return nextLayers
}
