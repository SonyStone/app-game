import type { StrokePointKey } from '../document'
import type { Vec3 } from '../shared/vector'

export type StrokePointOverlay = {
  key: StrokePointKey
  position: Vec3
  selected: boolean
}
