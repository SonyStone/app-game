import {
  createEffect,
  createMemo,
  createSignal,
  type Accessor,
} from 'solid-js'
import {
  createStrokePointKey,
  type Drawing,
  type Stroke,
  type StrokeId,
  type StrokePointKey,
} from '../document'
import type { ToolMode } from '../shared/toolMode'
import type { StrokePointOverlay } from './pointOverlay'

type DocumentSelectionParams = {
  activeDrawing: Accessor<Drawing | undefined>
  mode: Accessor<ToolMode>
}

export function useDocumentSelection(params: DocumentSelectionParams) {
  const [selectedStrokeIds, setSelectedStrokeIds] = createSignal<
    ReadonlySet<StrokeId>
  >(new Set<StrokeId>())
  const [selectedPointKeys, setSelectedPointKeys] = createSignal<
    ReadonlySet<StrokePointKey>
  >(new Set<StrokePointKey>())

  const selectedStrokeCount = createMemo(() => {
    const selected = selectedStrokeIds()
    return params.activeDrawing()?.strokes.filter((stroke) => selected.has(stroke.id)).length ?? 0
  })
  const selectedPointCount = createMemo(() => selectedPointKeys().size)
  const pointOverlays = createMemo<StrokePointOverlay[]>(() => {
    const drawing = params.activeDrawing()
    const selected = selectedPointKeys()
    if (!drawing || (params.mode() !== 'edit' && selected.size === 0)) return []

    const overlays: StrokePointOverlay[] = []
    for (const stroke of drawing.strokes) {
      stroke.points.forEach((point, pointIndex) => {
        const key = createStrokePointKey(stroke.id, pointIndex)
        overlays.push({
          key,
          position: point.position,
          selected: selected.has(key),
        })
      })
    }
    return overlays
  })

  createEffect(() => {
    const drawing = params.activeDrawing()
    const liveStrokeIds = new Set(drawing?.strokes.map((stroke) => stroke.id) ?? [])
    setSelectedStrokeIds((current) => intersectStrokeIds(current, liveStrokeIds))
    setSelectedPointKeys((current) =>
      intersectPointKeys(current, getLivePointKeys(drawing?.strokes ?? [])),
    )
  })

  return {
    pointOverlays,
    selectedPointCount,
    selectedPointKeys,
    selectedStrokeCount,
    selectedStrokeIds,
    setSelectedPointKeys,
    setSelectedStrokeIds,
  } as const
}

function intersectStrokeIds(
  current: ReadonlySet<StrokeId>,
  liveStrokeIds: ReadonlySet<StrokeId>,
): ReadonlySet<StrokeId> {
  let changed = false
  const next = new Set<StrokeId>()

  for (const strokeId of current) {
    if (liveStrokeIds.has(strokeId)) {
      next.add(strokeId)
    }
    else {
      changed = true
    }
  }

  return changed ? next : current
}

function getLivePointKeys(strokes: readonly Stroke[]) {
  const keys = new Set<StrokePointKey>()
  for (const stroke of strokes) {
    stroke.points.forEach((_point, pointIndex) => {
      keys.add(createStrokePointKey(stroke.id, pointIndex))
    })
  }
  return keys
}

function intersectPointKeys(
  current: ReadonlySet<StrokePointKey>,
  livePointKeys: ReadonlySet<StrokePointKey>,
): ReadonlySet<StrokePointKey> {
  let changed = false
  const next = new Set<StrokePointKey>()

  for (const pointKey of current) {
    if (livePointKeys.has(pointKey)) {
      next.add(pointKey)
    }
    else {
      changed = true
    }
  }

  return changed ? next : current
}
