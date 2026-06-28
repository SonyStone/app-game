import type { Accessor, Setter } from 'solid-js'
import {
  appendStrokeToLayerFrame,
  createStroke,
  type GreaseDocument,
  type GreaseLayer,
  type GreaseMaterial,
  type LayerId,
  type Stroke,
  type StrokePoint,
} from '../../document'
import {
  clamp,
  distance3,
  type Vec3,
} from '../../shared/vector'
import type { ToolMode } from '../../shared/toolMode'
import { shouldAppendPoint } from './drawingInput'
import {
  strokeInputSampleFromEvent,
  strokePointFromSample,
  type StrokeInputSample,
} from './strokeInput'
import type { InteractionViewport } from './viewportPort'

const SMOOTHING_MIN_SAMPLE_DISTANCE = 0.012
const SMOOTHING_MAX_SAMPLE_DISTANCE = 0.05
const SMOOTHING_SAMPLE_RADIUS_FACTOR = 0.35
const MAX_SMOOTHING_SAMPLES_PER_SEGMENT = 24

type DrawingTarget = {
  layerId: LayerId
  frameNumber: number
}

type StrokeDrawingParams = {
  activeLayer: Accessor<GreaseLayer | undefined>
  activeMaterial: Accessor<GreaseMaterial>
  brushStrength: Accessor<number>
  currentFrame: Accessor<number>
  draftStroke: Accessor<Stroke | undefined>
  mode: Accessor<ToolMode>
  renderer: Accessor<InteractionViewport | undefined>
  setDocumentState: Setter<GreaseDocument>
  setDraftStroke: Setter<Stroke | undefined>
  setPointerLabel: Setter<string>
}

export function createStrokeDrawingInteraction(params: StrokeDrawingParams) {
  let drawingPointerId: number | undefined
  let drawingTarget: DrawingTarget | undefined
  let lastSmoothedSample: StrokeInputSample | undefined
  let sampleBuffer: StrokeInputSample[] = []

  const startStroke = (event: PointerEvent) => {
    const layer = params.activeLayer()
    if (!layer || layer.locked || !layer.visible) {
      params.setPointerLabel('Layer unavailable')
      return
    }

    const renderer = params.renderer()
    if (!renderer) return

    const position = renderer.screenToWorld(event.clientX, event.clientY)
    if (!position) return

    const material = params.activeMaterial()
    const sample = strokeInputSampleFromEvent(
      event,
      renderer.offsetFromWorkplane(position, 0.002),
    )
    const point = strokePointFromSample(
      sample,
      material,
      params.brushStrength(),
    )

    drawingPointerId = event.pointerId
    drawingTarget = {
      layerId: layer.id,
      frameNumber: params.currentFrame(),
    }
    lastSmoothedSample = sample
    sampleBuffer = [sample, sample]
    params.setDraftStroke(
      createStroke(material, [point], { closed: params.mode() === 'fill' }),
    )
    params.setPointerLabel(
      `${event.pointerType} pressure ${point.pressure.toFixed(2)}`,
    )
  }

  const appendDraftPoint = (event: PointerEvent) => {
    if (drawingPointerId !== event.pointerId) return
    const renderer = params.renderer()
    if (!renderer) return

    const samples = strokeSamplesFromPointerEvent(event, renderer)
    if (samples.length === 0) return

    const material = params.activeMaterial()
    const points = appendSmoothedSamples(
      samples,
      material,
      params.brushStrength(),
    )
    appendDraftPoints(points, event.pointerType)
  }

  const commitDraftStroke = (event: PointerEvent) => {
    if (drawingPointerId !== event.pointerId) return
    flushSmoothedSamples(event.pointerType)
    const draft = params.draftStroke()
    const target = drawingTarget
    drawingPointerId = undefined
    drawingTarget = undefined
    resetSmoothing()
    params.setDraftStroke(undefined)

    if (draft && target && draft.points.length > 0) {
      params.setDocumentState((currentDocument) =>
        appendStrokeToLayerFrame(
          currentDocument,
          target.layerId,
          target.frameNumber,
          draft,
        ),
      )
    }
    params.setPointerLabel('Ready')
  }

  const strokeSamplesFromPointerEvent = (
    event: PointerEvent,
    renderer: InteractionViewport,
  ) => {
    const coalescedEvents = event.getCoalescedEvents?.() ?? []
    const events = coalescedEvents.length > 0 ? coalescedEvents : [event]
    const samples: StrokeInputSample[] = []

    for (const inputEvent of events) {
      if (inputEvent.pointerId !== event.pointerId) continue

      const position = renderer.screenToWorld(
        inputEvent.clientX,
        inputEvent.clientY,
      )
      if (!position) continue

      samples.push(
        strokeInputSampleFromEvent(
          inputEvent,
          renderer.offsetFromWorkplane(position, 0.002),
        ),
      )
    }

    return samples
  }

  const appendSmoothedSamples = (
    samples: readonly StrokeInputSample[],
    material: GreaseMaterial,
    brushStrength: number,
  ) => {
    sampleBuffer.push(...samples)

    const points: StrokePoint[] = []
    const sampleDistance = smoothingSampleDistance(material)
    while (sampleBuffer.length >= 4) {
      const p0 = sampleBuffer[0]
      const p1 = sampleBuffer[1]
      const p2 = sampleBuffer[2]
      const p3 = sampleBuffer[3]
      if (!p0 || !p1 || !p2 || !p3) break

      const smoothedSamples = generateSmoothedSamples(
        p0,
        p1,
        p2,
        p3,
        sampleDistance,
      )
      for (const sample of smoothedSamples) {
        points.push(strokePointFromSample(sample, material, brushStrength))
      }
      lastSmoothedSample =
        smoothedSamples[smoothedSamples.length - 1] ?? lastSmoothedSample
      sampleBuffer.shift()
    }

    return points
  }

  const flushSmoothedSamples = (pointerType: string) => {
    const material = params.activeMaterial()
    const sampleDistance = smoothingSampleDistance(material)
    const points: StrokePoint[] = []
    let previous = lastSmoothedSample ?? sampleBuffer[0]

    for (const sample of sampleBuffer.slice(1)) {
      if (!previous) {
        previous = sample
        continue
      }

      for (const tailSample of generateLinearSamples(
        previous,
        sample,
        sampleDistance,
      )) {
        points.push(
          strokePointFromSample(tailSample, material, params.brushStrength()),
        )
      }
      previous = sample
    }

    appendDraftPoints(points, pointerType)
  }

  const appendDraftPoints = (
    points: readonly StrokePoint[],
    pointerType: string,
  ) => {
    if (points.length === 0) return

    let appendedPressure: number | undefined
    params.setDraftStroke((current) => {
      if (!current) return current

      const nextPoints = [...current.points]
      for (const point of points) {
        if (!shouldAppendPoint(nextPoints, point)) continue
        nextPoints.push(point)
        appendedPressure = point.pressure
      }

      if (nextPoints.length === current.points.length) return current
      return {
        ...current,
        points: nextPoints,
      }
    })

    if (appendedPressure !== undefined) {
      params.setPointerLabel(
        `${pointerType} pressure ${appendedPressure.toFixed(2)}`,
      )
    }
  }

  const resetSmoothing = () => {
    lastSmoothedSample = undefined
    sampleBuffer = []
  }

  return {
    appendDraftPoint,
    commitDraftStroke,
    startStroke,
  } as const
}

function smoothingSampleDistance(material: GreaseMaterial) {
  return clamp(
    material.strokeRadius * SMOOTHING_SAMPLE_RADIUS_FACTOR,
    SMOOTHING_MIN_SAMPLE_DISTANCE,
    SMOOTHING_MAX_SAMPLE_DISTANCE,
  )
}

function generateSmoothedSamples(
  p0: StrokeInputSample,
  p1: StrokeInputSample,
  p2: StrokeInputSample,
  p3: StrokeInputSample,
  sampleDistance: number,
) {
  const sampleCount = segmentSampleCount(
    p1.position,
    p2.position,
    sampleDistance,
  )
  const samples: StrokeInputSample[] = []
  for (let index = 0; index <= sampleCount; index += 1) {
    samples.push(catmullRomSample(p0, p1, p2, p3, index / sampleCount))
  }
  return samples
}

function generateLinearSamples(
  from: StrokeInputSample,
  to: StrokeInputSample,
  sampleDistance: number,
) {
  const sampleCount = segmentSampleCount(
    from.position,
    to.position,
    sampleDistance,
  )
  const samples: StrokeInputSample[] = []
  for (let index = 1; index <= sampleCount; index += 1) {
    samples.push(lerpSample(from, to, index / sampleCount))
  }
  return samples
}

function segmentSampleCount(from: Vec3, to: Vec3, sampleDistance: number) {
  return Math.max(
    1,
    Math.min(
      MAX_SMOOTHING_SAMPLES_PER_SEGMENT,
      Math.ceil(distance3(from, to) / sampleDistance),
    ),
  )
}

function catmullRomSample(
  p0: StrokeInputSample,
  p1: StrokeInputSample,
  p2: StrokeInputSample,
  p3: StrokeInputSample,
  t: number,
): StrokeInputSample {
  const t2 = t * t
  const t3 = t2 * t
  const b0 = -0.5 * t3 + t2 - 0.5 * t
  const b1 = 1.5 * t3 - 2.5 * t2 + 1
  const b2 = -1.5 * t3 + 2 * t2 + 0.5 * t
  const b3 = 0.5 * t3 - 0.5 * t2

  return {
    position: [
      catmullRomScalar(
        p0.position[0],
        p1.position[0],
        p2.position[0],
        p3.position[0],
        b0,
        b1,
        b2,
        b3,
      ),
      catmullRomScalar(
        p0.position[1],
        p1.position[1],
        p2.position[1],
        p3.position[1],
        b0,
        b1,
        b2,
        b3,
      ),
      catmullRomScalar(
        p0.position[2],
        p1.position[2],
        p2.position[2],
        p3.position[2],
        b0,
        b1,
        b2,
        b3,
      ),
    ],
    pressure: clamp(
      catmullRomScalar(
        p0.pressure,
        p1.pressure,
        p2.pressure,
        p3.pressure,
        b0,
        b1,
        b2,
        b3,
      ),
      0.08,
      1,
    ),
    pointerType: p2.pointerType,
    time: catmullRomScalar(
      p0.time,
      p1.time,
      p2.time,
      p3.time,
      b0,
      b1,
      b2,
      b3,
    ),
  }
}

function catmullRomScalar(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  b0: number,
  b1: number,
  b2: number,
  b3: number,
) {
  return b0 * p0 + b1 * p1 + b2 * p2 + b3 * p3
}

function lerpSample(
  from: StrokeInputSample,
  to: StrokeInputSample,
  t: number,
): StrokeInputSample {
  return {
    position: [
      lerp(from.position[0], to.position[0], t),
      lerp(from.position[1], to.position[1], t),
      lerp(from.position[2], to.position[2], t),
    ],
    pressure: clamp(lerp(from.pressure, to.pressure, t), 0.08, 1),
    pointerType: to.pointerType,
    time: lerp(from.time, to.time, t),
  }
}

function lerp(from: number, to: number, t: number) {
  return from + (to - from) * t
}
