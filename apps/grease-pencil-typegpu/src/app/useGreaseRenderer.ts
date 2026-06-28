import {
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  type Accessor,
} from 'solid-js'
import type {
  DrawingWorkplane,
  RenderLayer,
  Stroke,
  StrokeId,
  WorkplaneId,
} from '../document'
import type { ViewportMode } from '../shared/viewportMode'
import {
  GreaseRenderer,
  type StrokePointOverlay,
} from '../render/greaseRenderer'

type UseGreaseRendererParams = {
  canvas: Accessor<HTMLCanvasElement | undefined>
  draftStroke: Accessor<Stroke | undefined>
  pointOverlays: Accessor<readonly StrokePointOverlay[]>
  renderLayers: Accessor<readonly RenderLayer[]>
  activeWorkplaneId: Accessor<WorkplaneId>
  selectedStrokeIds: Accessor<ReadonlySet<StrokeId>>
  viewportMode: Accessor<ViewportMode>
  workplane: Accessor<DrawingWorkplane>
}

export function useGreaseRenderer(params: UseGreaseRendererParams) {
  const [renderer, setRenderer] = createSignal<GreaseRenderer>()
  const [status, setStatus] = createSignal('Starting WebGPU...')

  onMount(() => {
    let mounted = true
    const handleResize = () => renderer()?.resize()
    window.addEventListener('resize', handleResize)

    void (async () => {
      const canvas = params.canvas()
      if (!canvas) {
        setStatus('Canvas is not available.')
        return
      }

      const nextRenderer = new GreaseRenderer(canvas)
      setRenderer(nextRenderer)
      const result = await nextRenderer.init()
      if (mounted) setStatus(result.message)
    })()

    onCleanup(() => {
      mounted = false
      window.removeEventListener('resize', handleResize)
      renderer()?.destroy()
    })
  })

  createEffect(() => {
    renderer()?.setScene(
      [...params.renderLayers()],
      params.workplane(),
      params.selectedStrokeIds(),
      params.pointOverlays(),
    )
  })

  createEffect(() => {
    renderer()?.setDraftStroke(params.draftStroke())
  })

  let previousViewportMode: ViewportMode | undefined
  let previousWorkplaneId: WorkplaneId | undefined
  createEffect(() => {
    const viewportMode = params.viewportMode()
    const workplaneId = params.activeWorkplaneId()
    const snapTarget =
      viewportMode === '2d' &&
      (previousViewportMode !== viewportMode ||
        previousWorkplaneId !== workplaneId)

    renderer()?.setViewportMode(viewportMode, params.workplane(), snapTarget)
    previousViewportMode = viewportMode
    previousWorkplaneId = workplaneId
  })

  const zoom = (delta: number) => {
    renderer()?.zoom(delta)
  }

  return {
    renderer,
    status,
    zoom,
  } as const
}
