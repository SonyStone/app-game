import { transformMat4 } from './matrixTransform'
import type { ScreenSpaceGuides } from './screenSpaceGuides'
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
import {
  appendOrbitTarget,
  appendPointHandle,
  appendWorkplaneGizmo,
} from './meshOverlays'
import {
  getStrokeMaterial,
  getStrokeMaterialFromLayers,
} from './meshStyle'
import type {
  SelectedStrokeRender,
  StrokePointOverlay,
  StrokeRenderStyle,
} from './meshTypes'
import type { WorkplaneGizmoHighlight, WorkplaneGizmoMode } from './workplaneGizmoTypes'
import {
  appendStrokeGpuPrimitives,
  createStrokeGpuPrimitives,
  STROKE_POINT_FLOATS,
  STROKE_SEGMENT_FLOATS,
  type StrokeGpuPrimitiveRange,
  type StrokeGpuPrimitives,
} from './strokeGpuPrimitives'
import { getWorkplaneBasis } from './workplane'

export type { StrokePointOverlay } from './meshTypes'

export const FLOATS_PER_VERTEX = 7

const SELECTED_STROKE_COLOR: Vec4 = [1, 0.58, 0.08, 0.68]
const STROKE_DEPTH_BASE = 0.000001
const STROKE_DEPTH_STEP = 0.00001
const STROKE_DEPTH_FAR_LIMIT = 0.999999
const BASE_GRID_WORKPLANE: DrawingWorkplane = {
  origin: [0, 0, 0],
  rotation: [0, 0, 0],
  gridScale: 1,
}

export type BuildDrawingVerticesParams = {
  screenSpace: ScreenSpaceGuides
  layers: readonly RenderLayer[]
  workplane: DrawingWorkplane
  cameraDistance: number
  cameraTarget: Vec3
  draftStroke?: Stroke | undefined
  selectedStrokeIds?: ReadonlySet<StrokeId> | undefined
  pointOverlays?: readonly StrokePointOverlay[] | undefined
  workplaneGizmoMode?: WorkplaneGizmoMode
  workplaneGizmoHighlight?: WorkplaneGizmoHighlight | undefined
}

export type DrawingGeometry = {
  vertices: number[]
  strokePrimitives: StrokeGpuPrimitives
}

export type BuildCommittedDrawingGeometryParams = {
  layers: readonly RenderLayer[]
  selectedStrokeIds?: ReadonlySet<StrokeId> | undefined
  workplane: DrawingWorkplane
}

export type BuildDynamicDrawingGeometryParams = {
  screenSpace: ScreenSpaceGuides
  /** Show spatial guides in 3D; disable for a clean paper view. Defaults to true. */
  showGuides?: boolean
  billboardNormal: Vec3
  cameraDistance: number
  cameraTarget: Vec3
  draftStroke?: Stroke | undefined
  layers: readonly RenderLayer[]
  pointOverlays?: readonly StrokePointOverlay[] | undefined
  workplane: DrawingWorkplane
  workplaneGizmoMode?: WorkplaneGizmoMode
  workplaneGizmoHighlight?: WorkplaneGizmoHighlight | undefined
}

const DYNAMIC_STROKE_DEPTH = 0.9

export function buildCommittedDrawingGeometry({
  layers,
  workplane,
  selectedStrokeIds = new Set<StrokeId>(),
}: BuildCommittedDrawingGeometryParams): DrawingGeometry {
  const basis = getWorkplaneBasis(workplane)
  const vertices: number[] = []
  const strokePrimitives = createStrokeGpuPrimitives()
  const selectedStrokes: SelectedStrokeRender[] = []
  let strokeDepthOrder = 0
  const nextStrokeDepth = () =>
    Math.min(
      STROKE_DEPTH_FAR_LIMIT,
      STROKE_DEPTH_BASE + strokeDepthOrder++ * STROKE_DEPTH_STEP,
    )

  for (const layer of layers) {
    for (const stroke of layer.strokes) {
      const material = getStrokeMaterial(stroke, layer.materials)
      const fillStyle = {
        opacity: layer.opacity,
        strokeDepth: nextStrokeDepth(),
        zOffset: layer.zOffset,
        offsetNormal: basis.normal,
        ...(material ? { material } : {}),
        ...(layer.tintColor
          ? { color: layer.tintColor, ignoreVertexColor: true }
          : {}),
      } satisfies StrokeRenderStyle
      const strokeStyle = {
        ...fillStyle,
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
      strokeDepth: nextStrokeDepth(),
      zOffset: selectedStroke.zOffset + 0.024,
      offsetNormal: basis.normal,
      ...(selectedStroke.material ? { material: selectedStroke.material } : {}),
    } satisfies StrokeRenderStyle
    appendStrokeGpuPrimitives(
      strokePrimitives,
      vertices,
      selectedStroke.stroke,
      style,
    )
  }

  return {
    strokePrimitives,
    vertices,
  }
}

export function buildDynamicDrawingGeometry({
  screenSpace,
  layers,
  workplane,
  billboardNormal,
  cameraTarget,
  draftStroke,
  pointOverlays = [],
  workplaneGizmoHighlight,
  workplaneGizmoMode = 'translate',
  showGuides = true,
}: BuildDynamicDrawingGeometryParams): DrawingGeometry {
  const basis = getWorkplaneBasis(workplane)
  const vertices: number[] = []
  const strokePrimitives = createStrokeGpuPrimitives()

  if (showGuides) {
    appendBaseGrid(vertices, workplane, screenSpace)
    appendGrid(vertices, basis, workplane.gridScale, screenSpace)
    appendWorkplaneGizmo(vertices, basis, screenSpace, workplaneGizmoHighlight, workplaneGizmoMode)
  }
  if (draftStroke) {
    const material = getStrokeMaterialFromLayers(draftStroke, layers)
    const style = {
      opacity: 1,
      strokeDepth: DYNAMIC_STROKE_DEPTH,
      zOffset: 0.018,
      offsetNormal: billboardNormal,
      ...(material ? { material } : {}),
    } satisfies StrokeRenderStyle
    appendStrokeGpuPrimitives(strokePrimitives, vertices, draftStroke, style)
  }

  for (const pointOverlay of pointOverlays) {
    appendPointHandle(vertices, pointOverlay, billboardNormal)
  }
  if (showGuides) {
    const pivot = transformMat4(screenSpace.matrices.viewProjection, [...basis.origin, 1])
    const target = transformMat4(screenSpace.matrices.viewProjection, [...cameraTarget, 1])
    const separation = Math.hypot(
      (pivot[0] / pivot[3] - target[0] / target[3]) * screenSpace.width / 2,
      (pivot[1] / pivot[3] - target[1] / target[3]) * screenSpace.height / 2,
    )
    if (separation > 18) appendOrbitTarget(vertices, cameraTarget, screenSpace)
  }

  return {
    strokePrimitives,
    vertices,
  }
}

export function buildDrawingGeometry({
  screenSpace,
  layers,
  workplane,
  billboardNormal,
  cameraDistance,
  cameraTarget,
  draftStroke,
  selectedStrokeIds = new Set<StrokeId>(),
  pointOverlays = [],
  workplaneGizmoHighlight,
  workplaneGizmoMode = 'translate',
}: BuildDrawingVerticesParams & { billboardNormal: Vec3 }): DrawingGeometry {
  return mergeDrawingGeometry(
    buildCommittedDrawingGeometry({
      layers,
      workplane,
      selectedStrokeIds,
    }),
    buildDynamicDrawingGeometry({
      screenSpace,
      layers,
      workplane,
      billboardNormal,
      cameraDistance,
      cameraTarget,
      draftStroke,
      pointOverlays,
      workplaneGizmoHighlight,
      workplaneGizmoMode,
    }),
  )
}

function mergeDrawingGeometry(
  baseGeometry: DrawingGeometry,
  overlayGeometry: DrawingGeometry,
): DrawingGeometry {
  const strokePrimitives = createStrokeGpuPrimitives()
  strokePrimitives.segments.push(
    ...baseGeometry.strokePrimitives.segments,
    ...overlayGeometry.strokePrimitives.segments,
  )
  strokePrimitives.discs.push(
    ...baseGeometry.strokePrimitives.discs,
    ...overlayGeometry.strokePrimitives.discs,
  )
  strokePrimitives.squares.push(
    ...baseGeometry.strokePrimitives.squares,
    ...overlayGeometry.strokePrimitives.squares,
  )
  strokePrimitives.ranges.push(
    ...baseGeometry.strokePrimitives.ranges,
    ...offsetPrimitiveRanges(
      overlayGeometry.strokePrimitives.ranges,
      baseGeometry.strokePrimitives,
    ),
  )

  return {
    vertices: [...baseGeometry.vertices, ...overlayGeometry.vertices],
    strokePrimitives,
  }
}

function offsetPrimitiveRanges(
  ranges: readonly StrokeGpuPrimitiveRange[],
  basePrimitives: StrokeGpuPrimitives,
) {
  const segmentOffset = basePrimitives.segments.length / STROKE_SEGMENT_FLOATS
  const discOffset = basePrimitives.discs.length / STROKE_POINT_FLOATS
  const squareOffset = basePrimitives.squares.length / STROKE_POINT_FLOATS

  return ranges.map((range) => ({
    segmentStart: range.segmentStart + segmentOffset,
    segmentCount: range.segmentCount,
    discStart: range.discStart + discOffset,
    discCount: range.discCount,
    squareStart: range.squareStart + squareOffset,
    squareCount: range.squareCount,
  }))
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

function appendBaseGrid(vertices: number[], activeWorkplane: DrawingWorkplane, screenSpace: ScreenSpaceGuides) {
  if (sameWorkplane(activeWorkplane, BASE_GRID_WORKPLANE)) return
  appendGrid(
    vertices,
    getWorkplaneBasis(BASE_GRID_WORKPLANE),
    BASE_GRID_WORKPLANE.gridScale,
    screenSpace,
    {
      alphaScale: 0.45,
      neutral: true,
      zOffset: -0.025,
    },
  )
}

function sameWorkplane(a: DrawingWorkplane, b: DrawingWorkplane) {
  return (
    sameVec3(a.origin, b.origin) &&
    sameVec3(a.rotation, b.rotation) &&
    Math.abs(a.gridScale - b.gridScale) <= 1e-6
  )
}

function sameVec3(a: Vec3, b: Vec3) {
  return (
    Math.abs(a[0] - b[0]) <= 1e-6 &&
    Math.abs(a[1] - b[1]) <= 1e-6 &&
    Math.abs(a[2] - b[2]) <= 1e-6
  )
}
