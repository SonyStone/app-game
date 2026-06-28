import type {
  DrawingWorkplane,
  RenderLayer,
  Stroke,
  StrokeId,
} from '../document'
import type { Vec4 } from './math'
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
import { appendStroke } from './strokeTessellator'
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

export function buildDrawingVertices({
  layers,
  workplane,
  draftStroke,
  selectedStrokeIds = new Set<StrokeId>(),
  pointOverlays = [],
}: BuildDrawingVerticesParams): number[] {
  const basis = getWorkplaneBasis(workplane)
  const vertices: number[] = []
  appendGrid(vertices, basis, workplane.gridScale)
  const selectedStrokes: SelectedStrokeRender[] = []

  for (const layer of layers) {
    for (const stroke of layer.strokes) {
      const material = getStrokeMaterial(stroke, layer.materials)
      const style = {
        opacity: layer.opacity,
        zOffset: layer.zOffset,
        offsetNormal: basis.normal,
        ...(material ? { material } : {}),
        ...(layer.tintColor
          ? { color: layer.tintColor, ignoreVertexColor: true }
          : {}),
      } satisfies StrokeRenderStyle

      appendStroke(vertices, stroke, style)
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
      offsetNormal: basis.normal,
      ...(selectedStroke.material ? { material: selectedStroke.material } : {}),
    } satisfies StrokeRenderStyle
    appendStroke(vertices, selectedStroke.stroke, style)
  }

  if (draftStroke) {
    const material = getStrokeMaterialFromLayers(draftStroke, layers)
    const style = {
      opacity: 1,
      zOffset: 0.018,
      offsetNormal: basis.normal,
      ...(material ? { material } : {}),
    } satisfies StrokeRenderStyle
    appendStroke(vertices, draftStroke, style)
  }

  for (const pointOverlay of pointOverlays) {
    appendPointHandle(vertices, pointOverlay, basis.normal)
  }

  return vertices
}
