import type { GreaseLayer } from '../../document'

export function isEditableLayer(layer: GreaseLayer | undefined) {
  return Boolean(layer && layer.visible && !layer.locked)
}
