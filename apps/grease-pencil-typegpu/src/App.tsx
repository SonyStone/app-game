import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  type ComponentProps,
} from 'solid-js'
import {
  addLayer,
  clearActiveDrawing,
  countDocumentPoints,
  countDocumentStrokes,
  countLayerVisibleStrokes,
  createInitialDocument,
  createStrokePointKey,
  deleteActiveFrame,
  duplicateHeldFrame,
  getActiveLayer,
  getActiveMaterial,
  getLayerDrawingAtFrame,
  getRenderLayers,
  insertBlankFrame,
  loadDocumentFromStorage,
  moveLayerTowardBottom,
  moveLayerTowardTop,
  removeLayer,
  resetWorkplane,
  saveDocumentToStorage,
  setActiveLayer,
  setActiveMaterial,
  setActiveMaterialCapStyle,
  setActiveMaterialFillColor,
  setActiveMaterialFillStyle,
  setActiveMaterialGradientType,
  setActiveMaterialJoinStyle,
  setActiveMaterialMixColor,
  setActiveMaterialStrokeColor,
  setActiveMaterialStrokeMode,
  setActiveMaterialStrokeRadius,
  setActiveMaterialUseFill,
  setActiveMaterialUseStroke,
  setCurrentFrame,
  setLayerOpacity,
  setOnionSkinEnabled,
  setOnionSkinNextFrames,
  setOnionSkinOpacity,
  setOnionSkinPreviousFrames,
  setWorkplaneOrigin,
  setWorkplaneRotation,
  setWorkplaneScale,
  toggleLayerLock,
  toggleLayerVisibility,
  undoActiveDrawing,
  type GreaseDocument,
  type LayerId,
  type Stroke,
  type StrokeId,
  type StrokePointKey,
} from './document'
import { BrushControls } from './features/brush/BrushControls'
import { StrokeColorStrip } from './features/brush/StrokeColorStrip'
import { EditCommandBar } from './features/editing/EditCommandBar'
import { useCanvasInteraction } from './features/interaction/useCanvasInteraction'
import { LayerPanel } from './features/layers/LayerPanel'
import { MaterialPanel } from './features/materials/MaterialPanel'
import { OnionSkinPanel } from './features/onionSkin/OnionSkinPanel'
import { FrameControls } from './features/timeline/FrameControls'
import { ToolModeBar } from './features/tools/ToolModeBar'
import type { ToolMode } from './features/tools/toolMode'
import { CanvasViewport } from './features/viewport/CanvasViewport'
import { WorkplanePanel } from './features/workplane/WorkplanePanel'
import {
  GreaseRenderer,
  type StrokePointOverlay,
} from './render/greaseRenderer'
import './index.css'

function App() {
  let canvasRef!: HTMLCanvasElement
  let renderer: GreaseRenderer | undefined

  const [mode, setMode] = createSignal<ToolMode>('draw')
  const [status, setStatus] = createSignal('Starting WebGPU...')
  const [documentState, setDocumentState] = createSignal<GreaseDocument>(
    loadDocumentFromStorage() ?? createInitialDocument(),
  )
  const [draftStroke, setDraftStroke] = createSignal<Stroke>()
  const [selectedStrokeIds, setSelectedStrokeIds] = createSignal<
    ReadonlySet<StrokeId>
  >(new Set<StrokeId>())
  const [selectedPointKeys, setSelectedPointKeys] = createSignal<
    ReadonlySet<StrokePointKey>
  >(new Set<StrokePointKey>())
  const [eraserRadius, setEraserRadius] = createSignal(0.18)
  const [brushStrength, setBrushStrength] = createSignal(1)
  const [pointerLabel, setPointerLabel] = createSignal('Ready')

  const activeLayer = createMemo(() => getActiveLayer(documentState()))
  const activeDrawing = createMemo(() => {
    const layer = activeLayer()
    if (!layer) return undefined
    return getLayerDrawingAtFrame(documentState(), layer.id)
  })
  const renderLayers = createMemo(() => getRenderLayers(documentState()))
  const workplane = createMemo(() => documentState().workplane)
  const onionSkin = createMemo(() => documentState().onionSkin)
  const activeMaterial = createMemo(() => getActiveMaterial(documentState()))
  const materials = createMemo(() => documentState().materials)
  const layersTopFirst = createMemo(() => [...documentState().layers].reverse())
  const strokeCount = createMemo(() => countDocumentStrokes(documentState()))
  const pointCount = createMemo(() => countDocumentPoints(documentState()))
  const selectedStrokeCount = createMemo(() => {
    const selected = selectedStrokeIds()
    return activeDrawing()?.strokes.filter((stroke) => selected.has(stroke.id)).length ?? 0
  })
  const selectedPointCount = createMemo(() => selectedPointKeys().size)
  const pointOverlays = createMemo<StrokePointOverlay[]>(() => {
    const drawing = activeDrawing()
    const selected = selectedPointKeys()
    if (!drawing || (mode() !== 'edit' && selected.size === 0)) return []

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

  const canvasInteraction = useCanvasInteraction({
    canvas: () => canvasRef,
    renderer: () => renderer,
    mode,
    activeLayer,
    activeDrawing,
    activeMaterial,
    currentFrame: () => documentState().currentFrame,
    brushStrength,
    eraserRadius,
    draftStroke,
    setDraftStroke,
    selectedStrokeIds,
    setSelectedStrokeIds,
    selectedPointKeys,
    setSelectedPointKeys,
    selectedStrokeCount,
    selectedPointCount,
    setDocumentState,
    setPointerLabel,
  })

  onMount(() => {
    let mounted = true
    const handleResize = () => renderer?.resize()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTextInputTarget(event.target)) return
      if (event.key !== 'Backspace' && event.key !== 'Delete') return
      if (selectedPointKeys().size === 0 && selectedStrokeIds().size === 0) return

      event.preventDefault()
      if (selectedPointKeys().size > 0) canvasInteraction.deleteSelectedPoints()
      else canvasInteraction.deleteSelectedStrokes()
    }
    window.addEventListener('resize', handleResize)
    window.addEventListener('keydown', handleKeyDown)

    void (async () => {
      renderer = new GreaseRenderer(canvasRef)
      const result = await renderer.init()
      if (mounted) setStatus(result.message)
    })()

    onCleanup(() => {
      mounted = false
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('keydown', handleKeyDown)
      renderer?.destroy()
    })
  })

  createEffect(() => {
    renderer?.setScene(
      renderLayers(),
      workplane(),
      draftStroke(),
      selectedStrokeIds(),
      pointOverlays(),
    )
  })

  createEffect(() => {
    saveDocumentToStorage(documentState())
  })

  createEffect(() => {
    const drawing = activeDrawing()
    const liveStrokeIds = new Set(drawing?.strokes.map((stroke) => stroke.id) ?? [])
    setSelectedStrokeIds((current) => intersectStrokeIds(current, liveStrokeIds))
    setSelectedPointKeys((current) =>
      intersectPointKeys(current, getLivePointKeys(drawing?.strokes ?? [])),
    )
  })

  const updateDocument = (updater: (document: GreaseDocument) => GreaseDocument) => {
    setDraftStroke(undefined)
    setDocumentState(updater)
  }

  const canMoveLayerTowardTop = (layerId: LayerId) => {
    const layerIndex = documentState().layers.findIndex((layer) => layer.id === layerId)
    return layerIndex >= 0 && layerIndex < documentState().layers.length - 1
  }

  const canMoveLayerTowardBottom = (layerId: LayerId) => {
    return documentState().layers.findIndex((layer) => layer.id === layerId) > 0
  }

  return (
    <main class="grease-pencil-root flex h-dvh w-full flex-col bg-stone-100 text-stone-950">
      <Body class="m-0 overflow-hidden" />
      <header class="app-toolbar">
        <ToolModeBar mode={mode()} onSetMode={setMode} />

        <StrokeColorStrip
          activeStrokeColor={activeMaterial().strokeColor}
          onSetStrokeColor={(strokeColor) =>
            updateDocument((currentDocument) =>
              setActiveMaterialStrokeColor(currentDocument, strokeColor),
            )
          }
        />

        <BrushControls
          strokeRadius={activeMaterial().strokeRadius}
          brushStrength={brushStrength()}
          eraserRadius={eraserRadius()}
          onSetStrokeRadius={(strokeRadius) =>
            updateDocument((currentDocument) =>
              setActiveMaterialStrokeRadius(currentDocument, strokeRadius),
            )
          }
          onSetBrushStrength={setBrushStrength}
          onSetEraserRadius={setEraserRadius}
        />

        <FrameControls
          currentFrame={documentState().currentFrame}
          onSetCurrentFrame={(frameNumber) =>
            updateDocument((currentDocument) =>
              setCurrentFrame(currentDocument, frameNumber),
            )
          }
          onPreviousFrame={() =>
            updateDocument((currentDocument) =>
              setCurrentFrame(currentDocument, currentDocument.currentFrame - 1),
            )
          }
          onNextFrame={() =>
            updateDocument((currentDocument) =>
              setCurrentFrame(currentDocument, currentDocument.currentFrame + 1),
            )
          }
          onInsertBlankFrame={() => updateDocument(insertBlankFrame)}
          onDuplicateHeldFrame={() => updateDocument(duplicateHeldFrame)}
          onDeleteActiveFrame={() => updateDocument(deleteActiveFrame)}
        />

        <EditCommandBar
          canDeleteSelection={selectedStrokeCount() > 0 || selectedPointCount() > 0}
          onDeleteSelection={canvasInteraction.deleteCurrentSelection}
          onUndo={() => updateDocument(undoActiveDrawing)}
          onClear={() => updateDocument(clearActiveDrawing)}
        />
      </header>

      <section class="workspace">
        <CanvasViewport
          canvasRef={(canvas) => {
            canvasRef = canvas
          }}
          details={`Frame ${documentState().currentFrame} · ${
            activeLayer()?.name ?? 'No layer'
          } · ${strokeCount()} strokes · ${pointCount()} points · ${selectedStrokeCount()} strokes selected · ${selectedPointCount()} points selected · ${pointerLabel()}`}
          status={status()}
          onPointerDown={canvasInteraction.onPointerDown}
          onPointerMove={canvasInteraction.onPointerMove}
          onPointerUp={canvasInteraction.onPointerUp}
          onPointerCancel={canvasInteraction.onPointerUp}
          onWheel={(event) => {
            event.preventDefault()
            renderer?.zoom(event.deltaY)
          }}
        />

        <aside class="layer-panel">
          <WorkplanePanel
            workplane={workplane()}
            onReset={() => updateDocument(resetWorkplane)}
            onSetOrigin={(axis, value) =>
              updateDocument((currentDocument) =>
                setWorkplaneOrigin(currentDocument, axis, value),
              )
            }
            onSetRotation={(axis, value) =>
              updateDocument((currentDocument) =>
                setWorkplaneRotation(currentDocument, axis, value),
              )
            }
            onSetScale={(value) =>
              updateDocument((currentDocument) =>
                setWorkplaneScale(currentDocument, value),
              )
            }
          />

          <OnionSkinPanel
            onionSkin={onionSkin()}
            onSetEnabled={(enabled) =>
              updateDocument((currentDocument) =>
                setOnionSkinEnabled(currentDocument, enabled),
              )
            }
            onSetPreviousFrames={(previousFrames) =>
              updateDocument((currentDocument) =>
                setOnionSkinPreviousFrames(currentDocument, previousFrames),
              )
            }
            onSetNextFrames={(nextFrames) =>
              updateDocument((currentDocument) =>
                setOnionSkinNextFrames(currentDocument, nextFrames),
              )
            }
            onSetOpacity={(opacity) =>
              updateDocument((currentDocument) =>
                setOnionSkinOpacity(currentDocument, opacity),
              )
            }
          />

          <MaterialPanel
            activeMaterial={activeMaterial()}
            activeMaterialId={documentState().activeMaterialId}
            materials={materials()}
            onSelectMaterial={(materialId) =>
              updateDocument((currentDocument) =>
                setActiveMaterial(currentDocument, materialId),
              )
            }
            onSetUseStroke={(useStroke) =>
              updateDocument((currentDocument) =>
                setActiveMaterialUseStroke(currentDocument, useStroke),
              )
            }
            onSetUseFill={(useFill) =>
              updateDocument((currentDocument) =>
                setActiveMaterialUseFill(currentDocument, useFill),
              )
            }
            onSetStrokeMode={(strokeMode) =>
              updateDocument((currentDocument) =>
                setActiveMaterialStrokeMode(currentDocument, strokeMode),
              )
            }
            onSetCapStyle={(capStyle) =>
              updateDocument((currentDocument) =>
                setActiveMaterialCapStyle(currentDocument, capStyle),
              )
            }
            onSetJoinStyle={(joinStyle) =>
              updateDocument((currentDocument) =>
                setActiveMaterialJoinStyle(currentDocument, joinStyle),
              )
            }
            onSetFillStyle={(fillStyle) =>
              updateDocument((currentDocument) =>
                setActiveMaterialFillStyle(currentDocument, fillStyle),
              )
            }
            onSetGradientType={(gradientType) =>
              updateDocument((currentDocument) =>
                setActiveMaterialGradientType(currentDocument, gradientType),
              )
            }
            onSetFillColor={(fillColor) =>
              updateDocument((currentDocument) =>
                setActiveMaterialFillColor(currentDocument, fillColor),
              )
            }
            onSetMixColor={(mixColor) =>
              updateDocument((currentDocument) =>
                setActiveMaterialMixColor(currentDocument, mixColor),
              )
            }
          />

          <LayerPanel
            activeLayerId={documentState().activeLayerId}
            layersTopFirst={layersTopFirst()}
            canMoveLayerTowardTop={canMoveLayerTowardTop}
            canMoveLayerTowardBottom={canMoveLayerTowardBottom}
            countVisibleStrokes={(layerId) =>
              countLayerVisibleStrokes(documentState(), layerId)
            }
            onAddLayer={() => updateDocument(addLayer)}
            onSelectLayer={(layerId) =>
              updateDocument((currentDocument) =>
                setActiveLayer(currentDocument, layerId),
              )
            }
            onMoveLayerTowardTop={(layerId) =>
              updateDocument((currentDocument) =>
                moveLayerTowardTop(currentDocument, layerId),
              )
            }
            onMoveLayerTowardBottom={(layerId) =>
              updateDocument((currentDocument) =>
                moveLayerTowardBottom(currentDocument, layerId),
              )
            }
            onToggleVisibility={(layerId) =>
              updateDocument((currentDocument) =>
                toggleLayerVisibility(currentDocument, layerId),
              )
            }
            onToggleLock={(layerId) =>
              updateDocument((currentDocument) =>
                toggleLayerLock(currentDocument, layerId),
              )
            }
            onRemoveLayer={(layerId) =>
              updateDocument((currentDocument) =>
                removeLayer(currentDocument, layerId),
              )
            }
            onSetLayerOpacity={(layerId, opacity) =>
              updateDocument((currentDocument) =>
                setLayerOpacity(currentDocument, layerId, opacity),
              )
            }
          />
        </aside>
      </section>
    </main>
  )
}

export default App

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

function isTextInputTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

function Body(props: Pick<ComponentProps<'body'>, 'class'>) {
  const previousClassName = document.body.className
  const previousMargin = document.body.style.margin
  const previousOverflow = document.body.style.overflow

  createEffect(() => {
    document.body.className = props.class ?? ''
    document.body.style.margin = '0'
    document.body.style.overflow = 'hidden'
  })

  onCleanup(() => {
    document.body.className = previousClassName
    document.body.style.margin = previousMargin
    document.body.style.overflow = previousOverflow
  })

  return null
}
