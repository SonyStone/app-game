import type {
  GreaseMaterial,
  Stroke,
  StrokePointKey,
} from '../document'
import type { Vec3, Vec4 } from './math'

export type StrokePointOverlay = {
  key: StrokePointKey
  position: Vec3
  selected: boolean
}

export type StrokeRenderStyle = {
  color?: Vec4
  material?: GreaseMaterial
  opacity: number
  ignorePointOpacity?: boolean
  ignoreVertexColor?: boolean
  radiusOffset?: number
  zOffset: number
  offsetNormal: Vec3
}

export type SelectedStrokeRender = {
  stroke: Stroke
  zOffset: number
  material?: GreaseMaterial
}
