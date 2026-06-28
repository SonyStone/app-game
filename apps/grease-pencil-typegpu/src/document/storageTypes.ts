import type { Vec4 } from '../shared/vector'
import type {
  Drawing,
  DrawingGrid,
  DrawingWorkplane,
  GreaseDocument,
  GreaseMaterial,
  MaterialFillStyle,
  MaterialGradientType,
  MaterialId,
  MaterialStrokeMode,
  OnionSkinSettings,
  Stroke,
  StrokeCapStyle,
  StrokeJoinStyle,
  StrokePoint,
  WorkplaneId,
} from './model'

export type StoredStrokePoint = Omit<
  StrokePoint,
  'radius' | 'opacity' | 'vertexColor'
> & {
  radius?: number
  opacity?: number
  vertexColor?: Vec4
}

export type StoredStroke = Omit<Stroke, 'materialId' | 'closed' | 'points'> & {
  materialId?: MaterialId
  closed?: boolean
  points: StoredStrokePoint[]
}

export type StoredDrawing = Omit<Drawing, 'strokes'> & {
  strokes: StoredStroke[]
}

export type StoredGreaseMaterial = Omit<
  GreaseMaterial,
  'capStyle' | 'joinStyle' | 'strokeMode' | 'fillStyle' | 'gradientType' | 'mixColor'
> & {
  capStyle?: StrokeCapStyle
  joinStyle?: StrokeJoinStyle
  strokeMode?: MaterialStrokeMode
  fillStyle?: MaterialFillStyle
  gradientType?: MaterialGradientType
  mixColor?: Vec4
}

export type StoredGreaseDocument = Omit<
  GreaseDocument,
  | 'activeMaterialId'
  | 'activeWorkplaneId'
  | 'workplane'
  | 'workplanes'
  | 'onionSkin'
  | 'drawings'
  | 'materials'
> & {
  activeMaterialId?: MaterialId
  activeWorkplaneId?: WorkplaneId
  workplane?: DrawingWorkplane
  workplanes?: DrawingGrid[]
  onionSkin?: OnionSkinSettings
  drawings: StoredDrawing[]
  materials?: StoredGreaseMaterial[]
}
