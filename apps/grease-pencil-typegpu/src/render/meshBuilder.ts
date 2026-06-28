import type {
  DrawingWorkplane,
  RenderLayer,
  Stroke,
  StrokeId,
} from '../document'
import type {
  Vec3,
  Vec4,
} from './math'
import { appendFill } from './meshFill'
import { appendGrid } from './meshGrid'
import { appendPointHandle } from './meshOverlays'
import {
  getStrokeMaterial,
  getStrokeMaterialFromLayers,
} from './meshStyle'
import type {
  SelectedStrokeRender,
  StrokePointOverlay,
  StrokeRenderStyle,
} from './meshTypes'
import {
  appendStrokeGpuPrimitives,
  createStrokeGpuPrimitives,
  type StrokeGpuPrimitives,
} from './strokeGpuPrimitives'
import { getWorkplaneBasis } from './workplane'

export type { StrokePointOverlay } from './meshTypes'

export const FLOATS_PER_VERTEX = 7

const SELECTED_STROKE_COLOR: Vec4 = [1, 0.58, 0.08, 0.68]

export type BuildDrawingVerticesParams = {
  layers: readonly RenderLayer[]
  workplane: DrawingWorkplane
  draftStroke?: Stroke | undefined
  selectedStrokeIds?: ReadonlySet<StrokeId> | undefined
  pointOverlays?: readonly StrokePointOverlay[] | undefined
}

export type DrawingGeometry = {
  vertices: number[]
  strokePrimitives: StrokeGpuPrimitives
}

export function buildDrawingGeometry({
  layers,
  workplane,
  billboardNormal,
  draftStroke,
  selectedStrokeIds = new Set<StrokeId>(),
  pointOverlays = [],
}: BuildDrawingVerticesParams & { billboardNormal: Vec3 }): DrawingGeometry {
  const basis = getWorkplaneBasis(workplane)
  const vertices: number[] = []
  const strokePrimitives = createStrokeGpuPrimitives()
  appendGrid(vertices, basis, workplane.gridScale)
  const selectedStrokes: SelectedStrokeRender[] = []

  for (const layer of layers) {
    for (const stroke of layer.strokes) {
      const material = getStrokeMaterial(stroke, layer.materials)
      const fillStyle = {
        opacity: layer.opacity,
        zOffset: layer.zOffset,
        offsetNormal: basis.normal,
        ...(material ? { material } : {}),
        ...(layer.tintColor
          ? { color: layer.tintColor, ignoreVertexColor: true }
          : {}),
      } satisfies StrokeRenderStyle
      const strokeStyle = {
        ...fillStyle,
        offsetNormal: billboardNormal,
      } satisfies StrokeRenderStyle

      appendStrokeFill(vertices, stroke, fillStyle)
      appendStrokeGpuPrimitives(strokePrimitives, vertices, stroke, strokeStyle)
      if (!layer.tintColor && selectedStrokeIds.has(stroke.id)) {
        const selectedStroke: SelectedStrokeRender = {
          stroke,
          zOffset: layer.zOffset,
        }
        if (material) selectedStroke.material = material
        selectedStrokes.push(selectedStroke)
      }
    }
  }

  for (const selectedStroke of selectedStrokes) {
    const style = {
      color: SELECTED_STROKE_COLOR,
      opacity: 1,
      ignorePointOpacity: true,
      ignoreVertexColor: true,
      radiusOffset: 0.018,
      zOffset: selectedStroke.zOffset + 0.024,
      offsetNormal: billboardNormal,
      ...(selectedStroke.material ? { material: selectedStroke.material } : {}),
    } satisfies StrokeRenderStyle
    appendStrokeGpuPrimitives(
      strokePrimitives,
      vertices,
      selectedStroke.stroke,
      style,
    )
  }

  if (draftStroke) {
    const material = getStrokeMaterialFromLayers(draftStroke, layers)
    const style = {
      opacity: 1,
      zOffset: 0.018,
      offsetNormal: billboardNormal,
      ...(material ? { material } : {}),
    } satisfies StrokeRenderStyle
    appendStrokeGpuPrimitives(strokePrimitives, vertices, draftStroke, style)
  }

  for (const pointOverlay of pointOverlays) {
    appendPointHandle(vertices, pointOverlay, billboardNormal)
  }

  return {
    strokePrimitives,
    vertices,
  }
}

function appendStrokeFill(
  vertices: number[],
  stroke: Stroke,
  style: StrokeRenderStyle,
) {
  const fillColor = style.color ?? style.material?.fillColor
  const useFill = style.material?.useFill ?? false
  if (stroke.closed && useFill && fillColor) {
    appendFill(vertices, stroke, fillColor, style)
  }
}
