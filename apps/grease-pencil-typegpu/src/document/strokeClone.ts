import { copyVec3, copyVec4 } from './geometry'
import { createDrawingId, createStrokeId } from './ids'
import type {
  Drawing,
  Stroke,
  StrokePoint,
} from './model'

export function copyDrawingWithNewId(drawing: Drawing): Drawing {
  return {
    id: createDrawingId(),
    strokes: drawing.strokes.map(copyStroke),
  }
}

export function copyStroke(stroke: Stroke): Stroke {
  return {
    id: createStrokeId(),
    materialId: stroke.materialId,
    color: copyVec4(stroke.color),
    radius: stroke.radius,
    closed: stroke.closed,
    points: stroke.points.map(copyStrokePoint),
  }
}

function copyStrokePoint(point: StrokePoint): StrokePoint {
  return {
    ...point,
    position: copyVec3(point.position),
    vertexColor: copyVec4(point.vertexColor),
  }
}
