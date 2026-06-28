import { createSignal } from 'solid-js'
import { AppSidebar } from './app/AppSidebar'
import { AppToolbar } from './app/AppToolbar'
import { BodyClass } from './app/BodyClass'
import { useGreaseRenderer } from './app/useGreaseRenderer'
import { useDocumentSession } from './app/useDocumentSession'
import { useSelectionShortcuts } from './app/useSelectionShortcuts'
import { useCanvasInteraction } from './features/interaction/useCanvasInteraction'
import type { ToolMode } from './shared/toolMode'
import { CanvasViewport } from './features/viewport/CanvasViewport'
import './index.css'

function App() {
  let canvasRef!: HTMLCanvasElement

  const [mode, setMode] = createSignal<ToolMode>('draw')
  const [eraserRadius, setEraserRadius] = createSignal(0.18)
  const [brushStrength, setBrushStrength] = createSignal(1)
  const [pointerLabel, setPointerLabel] = createSignal('Ready')
  const {
    activeDrawing,
    activeLayer,
    activeMaterial,
    canMoveLayerTowardBottom,
    canMoveLayerTowardTop,
    countVisibleStrokes,
    documentState,
    draftStroke,
    layersTopFirst,
    materials,
    onionSkin,
    pointCount,
    pointOverlays,
    renderLayers,
    selectedPointCount,
    selectedPointKeys,
    selectedStrokeCount,
    selectedStrokeIds,
    setDocumentState,
    setDraftStroke,
    setSelectedPointKeys,
    setSelectedStrokeIds,
    strokeCount,
    updateDocument,
    workplane,
  } = useDocumentSession(mode)
  const { renderer, status, zoom } = useGreaseRenderer({
    canvas: () => canvasRef,
    draftStroke,
    pointOverlays,
    renderLayers,
    selectedStrokeIds,
    workplane,
  })

  const canvasInteraction = useCanvasInteraction({
    canvas: () => canvasRef,
    renderer,
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

  useSelectionShortcuts({
    deleteSelectedPoints: canvasInteraction.deleteSelectedPoints,
    deleteSelectedStrokes: canvasInteraction.deleteSelectedStrokes,
    selectedPointKeys,
    selectedStrokeIds,
  })

  return (
    <main class="grease-pencil-root flex h-dvh w-full flex-col bg-stone-100 text-stone-950">
      <BodyClass class="m-0 overflow-hidden" />
      <AppToolbar
        activeMaterial={activeMaterial()}
        brushStrength={brushStrength()}
        canDeleteSelection={selectedStrokeCount() > 0 || selectedPointCount() > 0}
        currentFrame={documentState().currentFrame}
        eraserRadius={eraserRadius()}
        mode={mode()}
        onDeleteSelection={canvasInteraction.deleteCurrentSelection}
        onSetBrushStrength={setBrushStrength}
        onSetEraserRadius={setEraserRadius}
        onSetMode={setMode}
        updateDocument={updateDocument}
      />

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
            zoom(event.deltaY)
          }}
        />

        <AppSidebar
          activeLayerId={documentState().activeLayerId}
          activeMaterial={activeMaterial()}
          activeMaterialId={documentState().activeMaterialId}
          canMoveLayerTowardBottom={canMoveLayerTowardBottom}
          canMoveLayerTowardTop={canMoveLayerTowardTop}
          countVisibleStrokes={countVisibleStrokes}
          layersTopFirst={layersTopFirst()}
          materials={materials()}
          onionSkin={onionSkin()}
          updateDocument={updateDocument}
          workplane={workplane()}
        />
      </section>
    </main>
  )
}

export default App
