import type {
  DrawingWorkplane,
  GreaseMaterial,
  MaterialStrokeMode,
  RenderLayer,
  Stroke,
  StrokeCapStyle,
  StrokeId,
  StrokeJoinStyle,
  StrokePoint,
  StrokePointKey,
} from '../document'
import {
  add3,
  clamp,
  cross3,
  distance3,
  dot3,
  length3,
  normalize3,
  scale3,
  sub3,
  type Vec3,
  type Vec4,
} from './math'
import {
  discBasis,
  getWorkplaneBasis,
  workplanePoint,
  type WorkplaneBasis,
} from './workplane'

export const FLOATS_PER_VERTEX = 7

const SELECTED_STROKE_COLOR: Vec4 = [1, 0.58, 0.08, 0.68]
const POINT_HANDLE_COLOR: Vec4 = [1, 1, 1, 0.82]
const SELECTED_POINT_COLOR: Vec4 = [1, 0.48, 0.02, 0.95]
const MITER_LIMIT = 4

export type StrokePointOverlay = {
  key: StrokePointKey
  position: Vec3
  selected: boolean
}

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
}: BuildDrawingVerticesParams) {
  const basis = getWorkplaneBasis(workplane)
  const vertices: number[] = []
  appendGrid(vertices, basis, workplane.gridScale)
  const selectedStrokes: SelectedStrokeRender[] = []

  for (const layer of layers) {
    for (const stroke of layer.strokes) {
      const material = getStrokeMaterial(stroke, layer.materials)
      const style: StrokeRenderStyle = {
        opacity: layer.opacity,
        zOffset: layer.zOffset,
        offsetNormal: basis.normal,
      }
      if (material) style.material = material
      if (layer.tintColor) {
        style.color = layer.tintColor
        style.ignoreVertexColor = true
      }

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
    const style: StrokeRenderStyle = {
      color: SELECTED_STROKE_COLOR,
      opacity: 1,
      ignorePointOpacity: true,
      ignoreVertexColor: true,
      radiusOffset: 0.018,
      zOffset: selectedStroke.zOffset + 0.024,
      offsetNormal: basis.normal,
    }
    if (selectedStroke.material) style.material = selectedStroke.material
    appendStroke(vertices, selectedStroke.stroke, style)
  }

  if (draftStroke) {
    const material = getStrokeMaterialFromLayers(draftStroke, layers)
    const style: StrokeRenderStyle = {
      opacity: 1,
      zOffset: 0.018,
      offsetNormal: basis.normal,
    }
    if (material) style.material = material
    appendStroke(vertices, draftStroke, style)
  }

  for (const pointOverlay of pointOverlays) {
    appendPointHandle(vertices, pointOverlay, basis.normal)
  }

  return vertices
}

type StrokeRenderStyle = {
  color?: Vec4
  material?: GreaseMaterial
  opacity: number
  ignorePointOpacity?: boolean
  ignoreVertexColor?: boolean
  radiusOffset?: number
  zOffset: number
  offsetNormal: Vec3
}

type SelectedStrokeRender = {
  stroke: Stroke
  zOffset: number
  material?: GreaseMaterial
}

type CornerGeometry = {
  previousDirection: Vec3
  nextDirection: Vec3
  previousNormal: Vec3
  nextNormal: Vec3
  side: 1 | -1
}

function appendGrid(
  vertices: number[],
  basis: WorkplaneBasis,
  gridScale: number,
) {
  const extent = 10
  const spacing = Math.max(0.1, gridScale)
  const size = extent * spacing
  for (let i = -extent; i <= extent; i += 1) {
    const position = i * spacing
    const isAxis = i === 0
    const alpha = isAxis ? 0.46 : i % 5 === 0 ? 0.2 : 0.115
    const width = (isAxis ? 0.012 : 0.006) * spacing
    const xColor: Vec4 = isAxis
      ? [0.86, 0.18, 0.18, alpha]
      : [0.16, 0.18, 0.2, alpha]
    const yColor: Vec4 = isAxis
      ? [0.16, 0.4, 0.88, alpha]
      : [0.16, 0.18, 0.2, alpha]
    appendSegment(
      vertices,
      workplanePoint(basis, position, -size),
      workplanePoint(basis, position, size),
      width,
      xColor,
      width,
      1,
      -0.014 * spacing,
      basis.normal,
    )
    appendSegment(
      vertices,
      workplanePoint(basis, -size, position),
      workplanePoint(basis, size, position),
      width,
      yColor,
      width,
      1,
      -0.014 * spacing,
      basis.normal,
    )
  }
}

function appendStroke(
  vertices: number[],
  stroke: Stroke,
  style: StrokeRenderStyle,
) {
  if (stroke.points.length === 0) return
  const color = style.color ?? style.material?.strokeColor ?? stroke.color
  const fillColor = style.color ?? style.material?.fillColor
  const useStroke = style.material?.useStroke ?? true
  const useFill = style.material?.useFill ?? false
  const capStyle = strokeCapStyle(style)
  const joinStyle = strokeJoinStyle(style)
  const strokeMode = materialStrokeMode(style)

  if (stroke.closed && useFill && fillColor) {
    appendFill(vertices, stroke, fillColor, style)
  }

  if (!useStroke) return

  if (strokeMode !== 'line') {
    appendStrokeSamples(vertices, stroke, color, style, strokeMode)
    return
  }

  if (stroke.points.length === 1) {
    const point = stroke.points[0]
    if (!point) return

    appendSinglePointStroke(
      vertices,
      point.position,
      strokeRadius(stroke, point, style),
      pointColor(color, point, style),
      style.opacity,
      style.zOffset,
      style.offsetNormal,
      capStyle,
    )
    return
  }

  const openSegmentCount = stroke.points.length - 1
  for (let i = 0; i < stroke.points.length - 1; i += 1) {
    const current = stroke.points[i]
    const next = stroke.points[i + 1]
    if (!current || !next) continue

    appendStrokeSegment(
      vertices,
      current.position,
      next.position,
      strokeRadius(stroke, current, style),
      strokeRadius(stroke, next, style),
      pointColor(color, current, style),
      pointColor(color, next, style),
      style.opacity,
      style.zOffset,
      style.offsetNormal,
      !stroke.closed && capStyle === 'square' && i === 0,
      !stroke.closed && capStyle === 'square' && i === openSegmentCount - 1,
    )
  }
  if (stroke.closed) {
    const first = stroke.points[0]
    const last = stroke.points[stroke.points.length - 1]
    if (first && last) {
      appendStrokeSegment(
        vertices,
        last.position,
        first.position,
        strokeRadius(stroke, last, style),
        strokeRadius(stroke, first, style),
        pointColor(color, last, style),
        pointColor(color, first, style),
        style.opacity,
        style.zOffset,
        style.offsetNormal,
        false,
        false,
      )
    }
  }

  appendStrokeJoins(vertices, stroke, color, style, capStyle, joinStyle)
}

function appendSinglePointStroke(
  vertices: number[],
  position: Vec3,
  radius: number,
  color: Vec4,
  opacity: number,
  zOffset: number,
  offsetNormal: Vec3,
  capStyle: StrokeCapStyle,
) {
  if (capStyle === 'flat') return

  if (capStyle === 'square') {
    appendSquarePoint(vertices, position, radius, color, opacity, zOffset, offsetNormal)
    return
  }

  appendDisc(vertices, position, radius, color, opacity, zOffset, offsetNormal)
}

function appendStrokeSamples(
  vertices: number[],
  stroke: Stroke,
  color: Vec4,
  style: StrokeRenderStyle,
  strokeMode: Exclude<MaterialStrokeMode, 'line'>,
) {
  for (const point of stroke.points) {
    const radius = strokeRadius(stroke, point, style)
    if (strokeMode === 'dot') {
      appendDisc(
        vertices,
        point.position,
        radius,
        pointColor(color, point, style),
        style.opacity,
        style.zOffset,
        style.offsetNormal,
      )
      continue
    }

    appendSquarePoint(
      vertices,
      point.position,
      radius,
      pointColor(color, point, style),
      style.opacity,
      style.zOffset,
      style.offsetNormal,
    )
  }
}

function appendStrokeSegment(
  vertices: number[],
  start: Vec3,
  end: Vec3,
  startRadius: number,
  endRadius: number,
  startColor: Vec4,
  endColor: Vec4,
  opacity: number,
  zOffset: number,
  offsetNormal: Vec3,
  extendStart: boolean,
  extendEnd: boolean,
) {
  let segmentStart = start
  let segmentEnd = end
  if (extendStart || extendEnd) {
    const delta = sub3(end, start)
    const length = length3(delta)
    if (length >= 1e-5) {
      const direction = scale3(delta, 1 / length)
      if (extendStart) {
        segmentStart = add3(segmentStart, scale3(direction, -startRadius))
      }
      if (extendEnd) {
        segmentEnd = add3(segmentEnd, scale3(direction, endRadius))
      }
    }
  }

  appendSegment(
    vertices,
    segmentStart,
    segmentEnd,
    startRadius,
    startColor,
    endRadius,
    opacity,
    zOffset,
    offsetNormal,
    endColor,
  )
}

function appendStrokeJoins(
  vertices: number[],
  stroke: Stroke,
  color: Vec4,
  style: StrokeRenderStyle,
  capStyle: StrokeCapStyle,
  joinStyle: StrokeJoinStyle,
) {
  const pointCount = stroke.points.length
  if (pointCount < 2) return

  if (!stroke.closed && capStyle === 'round') {
    const first = stroke.points[0]
    const last = stroke.points[pointCount - 1]
    if (first) {
      appendDisc(
        vertices,
        first.position,
        strokeRadius(stroke, first, style),
        pointColor(color, first, style),
        style.opacity,
        style.zOffset,
        style.offsetNormal,
      )
    }
    if (last) {
      appendDisc(
        vertices,
        last.position,
        strokeRadius(stroke, last, style),
        pointColor(color, last, style),
        style.opacity,
        style.zOffset,
        style.offsetNormal,
      )
    }
  }

  const firstJoinIndex = stroke.closed ? 0 : 1
  const lastJoinIndex = stroke.closed ? pointCount - 1 : pointCount - 2
  for (let pointIndex = firstJoinIndex; pointIndex <= lastJoinIndex; pointIndex += 1) {
    const previous = stroke.points[(pointIndex - 1 + pointCount) % pointCount]
    const point = stroke.points[pointIndex]
    const next = stroke.points[(pointIndex + 1) % pointCount]
    if (!previous || !point || !next) continue

    const radius = strokeRadius(stroke, point, style)
    const joinColor = pointColor(color, point, style)
    if (joinStyle === 'round') {
      appendDisc(
        vertices,
        point.position,
        radius,
        joinColor,
        style.opacity,
        style.zOffset,
        style.offsetNormal,
      )
      continue
    }

    if (joinStyle === 'bevel') {
      appendBevelJoin(
        vertices,
        previous.position,
        point.position,
        next.position,
        radius,
        joinColor,
        style.opacity,
        style.zOffset,
        style.offsetNormal,
      )
      continue
    }

    appendMiterJoin(
      vertices,
      previous.position,
      point.position,
      next.position,
      radius,
      joinColor,
      style.opacity,
      style.zOffset,
      style.offsetNormal,
    )
  }
}

function strokeRadius(
  stroke: Stroke,
  point: StrokePoint,
  style: Pick<StrokeRenderStyle, 'radiusOffset'>,
) {
  const radius = Number.isFinite(point.radius)
    ? point.radius
    : stroke.radius * point.pressure
  return Math.max(0.002, radius + (style.radiusOffset ?? 0))
}

function pointColor(
  color: Vec4,
  point: StrokePoint,
  style: Pick<StrokeRenderStyle, 'ignorePointOpacity' | 'ignoreVertexColor'>,
): Vec4 {
  const vertexColor = style.ignoreVertexColor
    ? color
    : blendVertexColor(color, point.vertexColor)
  if (style.ignorePointOpacity) return vertexColor
  return applyOpacity(vertexColor, pointOpacity(point))
}

function blendVertexColor(color: Vec4, vertexColor: Vec4): Vec4 {
  const mix = Number.isFinite(vertexColor[3]) ? clamp(vertexColor[3], 0, 1) : 0
  if (mix <= 0.001) return color

  return [
    interpolate(color[0], vertexColor[0], mix),
    interpolate(color[1], vertexColor[1], mix),
    interpolate(color[2], vertexColor[2], mix),
    color[3],
  ]
}

function applyOpacity(color: Vec4, opacity: number): Vec4 {
  const safeOpacity = Number.isFinite(opacity) ? clamp(opacity, 0, 1) : 1
  if (safeOpacity >= 0.999) return color
  return [color[0], color[1], color[2], color[3] * safeOpacity]
}

function interpolate(start: number, end: number, mix: number) {
  return start + (end - start) * mix
}

function averagePointOpacity(
  stroke: Stroke,
  style: Pick<StrokeRenderStyle, 'ignorePointOpacity'>,
) {
  if (style.ignorePointOpacity || stroke.points.length === 0) return 1

  let total = 0
  for (const point of stroke.points) total += pointOpacity(point)
  return total / stroke.points.length
}

function pointOpacity(point: StrokePoint) {
  if (!Number.isFinite(point.opacity)) return 1
  return clamp(point.opacity, 0, 1)
}

function appendFill(
  vertices: number[],
  stroke: Stroke,
  color: Vec4,
  style: StrokeRenderStyle,
) {
  if (stroke.points.length < 3) return

  const first = stroke.points[0]
  if (!first) return

  const fillOpacity = averagePointOpacity(stroke, style)
  const fillGradient = createFillGradient(stroke, style)
  const zOffset = style.zOffset - 0.003
  for (let pointIndex = 1; pointIndex < stroke.points.length - 1; pointIndex += 1) {
    const current = stroke.points[pointIndex]
    const next = stroke.points[pointIndex + 1]
    if (!current || !next) continue
    const firstColor = fillColorAtPoint(color, first.position, fillOpacity, fillGradient)
    const currentColor = fillColorAtPoint(
      color,
      current.position,
      fillOpacity,
      fillGradient,
    )
    const nextColor = fillColorAtPoint(color, next.position, fillOpacity, fillGradient)

    pushVertex(
      vertices,
      first.position,
      firstColor,
      style.opacity,
      zOffset,
      style.offsetNormal,
    )
    pushVertex(
      vertices,
      current.position,
      currentColor,
      style.opacity,
      zOffset,
      style.offsetNormal,
    )
    pushVertex(
      vertices,
      next.position,
      nextColor,
      style.opacity,
      zOffset,
      style.offsetNormal,
    )
  }
}

type FillGradient = {
  basis: Pick<WorkplaneBasis, 'right' | 'up'>
  minX: number
  maxX: number
  centerX: number
  centerY: number
  radius: number
  mixColor: Vec4
  gradientType: 'linear' | 'radial'
}

function createFillGradient(
  stroke: Stroke,
  style: StrokeRenderStyle,
): FillGradient | undefined {
  const material = style.material
  if (style.color || material?.fillStyle !== 'gradient') return

  const basis = discBasis(style.offsetNormal)
  const first = stroke.points[0]
  if (!first) return

  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const point of stroke.points) {
    const x = dot3(point.position, basis.right)
    const y = dot3(point.position, basis.up)
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }

  const centerX = (minX + maxX) * 0.5
  const centerY = (minY + maxY) * 0.5
  const radius = Math.max((maxX - minX) * 0.5, (maxY - minY) * 0.5, 1e-5)
  return {
    basis,
    minX,
    maxX,
    centerX,
    centerY,
    radius,
    mixColor: material.mixColor,
    gradientType: material.gradientType,
  }
}

function fillColorAtPoint(
  color: Vec4,
  position: Vec3,
  opacity: number,
  gradient: FillGradient | undefined,
) {
  if (!gradient) return applyOpacity(color, opacity)

  const factor =
    gradient.gradientType === 'radial'
      ? radialGradientFactor(position, gradient)
      : linearGradientFactor(position, gradient)
  return applyOpacity(interpolateColor(color, gradient.mixColor, factor), opacity)
}

function linearGradientFactor(position: Vec3, gradient: FillGradient) {
  const width = gradient.maxX - gradient.minX
  if (width <= 1e-5) return 0
  const x = dot3(position, gradient.basis.right)
  return clamp((x - gradient.minX) / width, 0, 1)
}

function radialGradientFactor(position: Vec3, gradient: FillGradient) {
  const x = dot3(position, gradient.basis.right)
  const y = dot3(position, gradient.basis.up)
  const distance = Math.hypot(x - gradient.centerX, y - gradient.centerY)
  return clamp(distance / gradient.radius, 0, 1)
}

function interpolateColor(start: Vec4, end: Vec4, mix: number): Vec4 {
  return [
    interpolate(start[0], end[0], mix),
    interpolate(start[1], end[1], mix),
    interpolate(start[2], end[2], mix),
    interpolate(start[3], end[3], mix),
  ]
}

function getStrokeMaterial(
  stroke: Stroke,
  materials: readonly GreaseMaterial[],
): GreaseMaterial | undefined {
  return materials.find((material) => material.id === stroke.materialId)
}

function getStrokeMaterialFromLayers(
  stroke: Stroke,
  layers: readonly RenderLayer[],
): GreaseMaterial | undefined {
  for (const layer of layers) {
    const material = getStrokeMaterial(stroke, layer.materials)
    if (material) return material
  }
}

function strokeCapStyle(style: Pick<StrokeRenderStyle, 'material'>): StrokeCapStyle {
  return style.material?.capStyle ?? 'round'
}

function strokeJoinStyle(
  style: Pick<StrokeRenderStyle, 'material'>,
): StrokeJoinStyle {
  return style.material?.joinStyle ?? 'round'
}

function materialStrokeMode(
  style: Pick<StrokeRenderStyle, 'material'>,
): MaterialStrokeMode {
  return style.material?.strokeMode ?? 'line'
}

function appendPointHandle(
  vertices: number[],
  pointOverlay: StrokePointOverlay,
  offsetNormal: Vec3,
) {
  const radius = pointOverlay.selected ? 0.062 : 0.038
  appendDisc(
    vertices,
    pointOverlay.position,
    radius,
    pointOverlay.selected ? SELECTED_POINT_COLOR : POINT_HANDLE_COLOR,
    1,
    0.048,
    offsetNormal,
  )
  if (!pointOverlay.selected) return

  appendDisc(
    vertices,
    pointOverlay.position,
    radius * 0.42,
    [0.08, 0.07, 0.06, 0.75],
    1,
    0.051,
    offsetNormal,
  )
}

function appendSegment(
  vertices: number[],
  start: Vec3,
  end: Vec3,
  startRadius: number,
  color: Vec4,
  endRadius = startRadius,
  opacity = 1,
  zOffset = 0,
  offsetNormal: Vec3 = [0, 0, 1],
  endColor: Vec4 = color,
) {
  const direction = sub3(end, start)
  const length = length3(direction)
  if (length < 1e-5) return

  const normal = normalize3(cross3(offsetNormal, direction))
  if (length3(normal) < 1e-5) return

  const a = add3(start, scale3(normal, startRadius))
  const b = add3(start, scale3(normal, -startRadius))
  const c = add3(end, scale3(normal, endRadius))
  const dPoint = add3(end, scale3(normal, -endRadius))

  pushVertex(vertices, a, color, opacity, zOffset, offsetNormal)
  pushVertex(vertices, b, color, opacity, zOffset, offsetNormal)
  pushVertex(vertices, c, endColor, opacity, zOffset, offsetNormal)
  pushVertex(vertices, c, endColor, opacity, zOffset, offsetNormal)
  pushVertex(vertices, b, color, opacity, zOffset, offsetNormal)
  pushVertex(vertices, dPoint, endColor, opacity, zOffset, offsetNormal)
}

function appendDisc(
  vertices: number[],
  center: Vec3,
  radius: number,
  color: Vec4,
  opacity = 1,
  zOffset = 0,
  offsetNormal: Vec3 = [0, 0, 1],
) {
  const segments = 14
  const safeRadius = Math.max(radius, 0.002)
  const basis = discBasis(offsetNormal)
  for (let i = 0; i < segments; i += 1) {
    const a = (i / segments) * Math.PI * 2
    const b = ((i + 1) / segments) * Math.PI * 2
    pushVertex(vertices, center, color, opacity, zOffset, offsetNormal)
    pushVertex(
      vertices,
      add3(
        center,
        add3(
          scale3(basis.right, Math.cos(a) * safeRadius),
          scale3(basis.up, Math.sin(a) * safeRadius),
        ),
      ),
      color,
      opacity,
      zOffset,
      offsetNormal,
    )
    pushVertex(
      vertices,
      add3(
        center,
        add3(
          scale3(basis.right, Math.cos(b) * safeRadius),
          scale3(basis.up, Math.sin(b) * safeRadius),
        ),
      ),
      color,
      opacity,
      zOffset,
      offsetNormal,
    )
  }
}

function appendSquarePoint(
  vertices: number[],
  center: Vec3,
  radius: number,
  color: Vec4,
  opacity = 1,
  zOffset = 0,
  offsetNormal: Vec3 = [0, 0, 1],
) {
  const safeRadius = Math.max(radius, 0.002)
  const basis = discBasis(offsetNormal)
  const right = scale3(basis.right, safeRadius)
  const up = scale3(basis.up, safeRadius)
  const a = add3(center, add3(right, up))
  const b = add3(center, add3(scale3(right, -1), up))
  const c = add3(center, add3(right, scale3(up, -1)))
  const dPoint = add3(center, add3(scale3(right, -1), scale3(up, -1)))

  pushVertex(vertices, a, color, opacity, zOffset, offsetNormal)
  pushVertex(vertices, b, color, opacity, zOffset, offsetNormal)
  pushVertex(vertices, c, color, opacity, zOffset, offsetNormal)
  pushVertex(vertices, c, color, opacity, zOffset, offsetNormal)
  pushVertex(vertices, b, color, opacity, zOffset, offsetNormal)
  pushVertex(vertices, dPoint, color, opacity, zOffset, offsetNormal)
}

function appendBevelJoin(
  vertices: number[],
  previous: Vec3,
  point: Vec3,
  next: Vec3,
  radius: number,
  color: Vec4,
  opacity = 1,
  zOffset = 0,
  offsetNormal: Vec3 = [0, 0, 1],
) {
  const corner = getCornerGeometry(previous, point, next, offsetNormal)
  if (!corner) return

  appendBevelSide(
    vertices,
    point,
    corner.previousNormal,
    corner.nextNormal,
    radius,
    corner.side,
    color,
    opacity,
    zOffset,
    offsetNormal,
  )
}

function appendMiterJoin(
  vertices: number[],
  previous: Vec3,
  point: Vec3,
  next: Vec3,
  radius: number,
  color: Vec4,
  opacity = 1,
  zOffset = 0,
  offsetNormal: Vec3 = [0, 0, 1],
) {
  const corner = getCornerGeometry(previous, point, next, offsetNormal)
  if (!corner) return

  const safeRadius = Math.max(radius, 0.002)
  const previousEdge = add3(
    point,
    scale3(corner.previousNormal, safeRadius * corner.side),
  )
  const nextEdge = add3(
    point,
    scale3(corner.nextNormal, safeRadius * corner.side),
  )
  const miterPoint = intersectOffsetLines(
    previousEdge,
    corner.previousDirection,
    nextEdge,
    corner.nextDirection,
    offsetNormal,
  )
  if (!miterPoint || distance3(point, miterPoint) > safeRadius * MITER_LIMIT) {
    appendBevelSide(
      vertices,
      point,
      corner.previousNormal,
      corner.nextNormal,
      radius,
      corner.side,
      color,
      opacity,
      zOffset,
      offsetNormal,
    )
    return
  }

  pushVertex(vertices, previousEdge, color, opacity, zOffset, offsetNormal)
  pushVertex(vertices, miterPoint, color, opacity, zOffset, offsetNormal)
  pushVertex(vertices, nextEdge, color, opacity, zOffset, offsetNormal)
}

function getCornerGeometry(
  previous: Vec3,
  point: Vec3,
  next: Vec3,
  offsetNormal: Vec3,
): CornerGeometry | undefined {
  const previousDelta = sub3(point, previous)
  const nextDelta = sub3(next, point)
  const previousLength = length3(previousDelta)
  const nextLength = length3(nextDelta)
  if (previousLength < 1e-5 || nextLength < 1e-5) return

  const previousDirection = scale3(previousDelta, 1 / previousLength)
  const nextDirection = scale3(nextDelta, 1 / nextLength)
  const turn = dot3(offsetNormal, cross3(previousDirection, nextDirection))
  if (Math.abs(turn) < 1e-5) return

  const previousNormal = normalize3(cross3(offsetNormal, previousDirection))
  const nextNormal = normalize3(cross3(offsetNormal, nextDirection))
  if (length3(previousNormal) < 1e-5 || length3(nextNormal) < 1e-5) return

  return {
    previousDirection,
    nextDirection,
    previousNormal,
    nextNormal,
    side: turn > 0 ? -1 : 1,
  }
}

function intersectOffsetLines(
  firstPoint: Vec3,
  firstDirection: Vec3,
  secondPoint: Vec3,
  secondDirection: Vec3,
  normal: Vec3,
): Vec3 | undefined {
  const denominator = dot3(normal, cross3(firstDirection, secondDirection))
  if (Math.abs(denominator) < 1e-5) return

  const delta = sub3(secondPoint, firstPoint)
  const t = dot3(normal, cross3(delta, secondDirection)) / denominator
  return add3(firstPoint, scale3(firstDirection, t))
}

function appendBevelSide(
  vertices: number[],
  point: Vec3,
  previousNormal: Vec3,
  nextNormal: Vec3,
  radius: number,
  side: 1 | -1,
  color: Vec4,
  opacity: number,
  zOffset: number,
  offsetNormal: Vec3,
) {
  const safeRadius = Math.max(radius, 0.002)
  const previousEdge = add3(point, scale3(previousNormal, safeRadius * side))
  const nextEdge = add3(point, scale3(nextNormal, safeRadius * side))

  pushVertex(vertices, point, color, opacity, zOffset, offsetNormal)
  pushVertex(vertices, previousEdge, color, opacity, zOffset, offsetNormal)
  pushVertex(vertices, nextEdge, color, opacity, zOffset, offsetNormal)
}

function pushVertex(
  vertices: number[],
  position: Vec3,
  color: Vec4,
  opacity = 1,
  zOffset = 0,
  offsetNormal: Vec3 = [0, 0, 1],
) {
  const offsetPosition = add3(position, scale3(offsetNormal, zOffset))
  vertices.push(
    offsetPosition[0],
    offsetPosition[1],
    offsetPosition[2],
    color[0],
    color[1],
    color[2],
    color[3] * opacity,
  )
}
