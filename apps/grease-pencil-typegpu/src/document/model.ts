import type { Vec3, Vec4 } from '../render/math'

type Brand<T, Name extends string> = T & { readonly __brand: Name }

export type DocumentId = Brand<string, 'DocumentId'>
export type LayerId = Brand<string, 'LayerId'>
export type DrawingId = Brand<string, 'DrawingId'>
export type FrameId = Brand<string, 'FrameId'>
export type StrokeId = Brand<string, 'StrokeId'>
export type StrokePointKey = Brand<string, 'StrokePointKey'>
export type MaterialId = Brand<string, 'MaterialId'>

export type Axis = 'x' | 'y' | 'z'
export const strokeCapStyles = ['round', 'flat', 'square'] as const
export const strokeJoinStyles = ['round', 'bevel', 'miter'] as const
export const materialStrokeModes = ['line', 'dot', 'square'] as const
export const materialFillStyles = ['solid', 'gradient'] as const
export const materialGradientTypes = ['linear', 'radial'] as const
export type StrokeCapStyle = (typeof strokeCapStyles)[number]
export type StrokeJoinStyle = (typeof strokeJoinStyles)[number]
export type MaterialStrokeMode = (typeof materialStrokeModes)[number]
export type MaterialFillStyle = (typeof materialFillStyles)[number]
export type MaterialGradientType = (typeof materialGradientTypes)[number]

export type DrawingWorkplane = {
  origin: Vec3
  rotation: Vec3
  gridScale: number
}

export type OnionSkinSettings = {
  enabled: boolean
  previousFrames: number
  nextFrames: number
  opacity: number
  previousColor: Vec4
  nextColor: Vec4
}

export type StrokePoint = {
  position: Vec3
  pressure: number
  radius: number
  opacity: number
  vertexColor: Vec4
  time: number
}

export type Stroke = {
  id: StrokeId
  materialId: MaterialId
  color: Vec4
  radius: number
  closed: boolean
  points: StrokePoint[]
}

export type GreaseMaterial = {
  id: MaterialId
  name: string
  strokeColor: Vec4
  fillColor: Vec4
  mixColor: Vec4
  strokeRadius: number
  useStroke: boolean
  useFill: boolean
  capStyle: StrokeCapStyle
  joinStyle: StrokeJoinStyle
  strokeMode: MaterialStrokeMode
  fillStyle: MaterialFillStyle
  gradientType: MaterialGradientType
}

export type LayerFrameType =
  | 'keyframe'
  | 'breakdown'
  | 'extreme'
  | 'jitter'
  | 'moving-hold'

export type LayerFrame = {
  id: FrameId
  frameNumber: number
  drawingId: DrawingId
  type: LayerFrameType
}

export type Drawing = {
  id: DrawingId
  strokes: Stroke[]
}

export type GreaseLayer = {
  id: LayerId
  name: string
  visible: boolean
  locked: boolean
  opacity: number
  frames: LayerFrame[]
}

export type GreaseDocument = {
  id: DocumentId
  name: string
  currentFrame: number
  activeLayerId: LayerId
  activeMaterialId: MaterialId
  workplane: DrawingWorkplane
  onionSkin: OnionSkinSettings
  layers: GreaseLayer[]
  drawings: Drawing[]
  materials: GreaseMaterial[]
}

export type RenderLayer = {
  id: LayerId
  opacity: number
  strokes: Stroke[]
  zOffset: number
  tintColor?: Vec4
  materials: GreaseMaterial[]
}

export const DOCUMENT_STORAGE_KEY = 'grease-pencil-typegpu.document.v1'
