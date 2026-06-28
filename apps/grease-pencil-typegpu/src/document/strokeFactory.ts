import { copyVec4 } from './geometry'
import { createStrokeId } from './ids'
import type {
  GreaseMaterial,
  Stroke,
  StrokePoint,
} from './model'
import { copyStrokePoint } from './strokePoints'

export function createStroke(
  material: GreaseMaterial,
  points: StrokePoint[],
  options: { closed?: boolean } = {},
): Stroke {
  return {
    id: createStrokeId(),
    materialId: material.id,
    color: copyVec4(material.strokeColor),
    radius: material.strokeRadius,
    closed: options.closed ?? false,
    points: points.map((point) =>
      copyStrokePoint(point, material.strokeRadius, material.strokeColor),
    ),
  }
}
