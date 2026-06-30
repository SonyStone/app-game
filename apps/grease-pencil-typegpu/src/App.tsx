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
import type {
  ViewCubeActionOptions,
  ViewCubeTarget,
} from '@app-game/solid-view-cube'
import './index.css'
import type { ViewportMode } from './shared/viewportMode'

function App() {
  let canvasRef!: HTMLCanvasElement

  const [mode, setMode] = createSignal<ToolMode>('draw')
  const [viewportMode, setViewportMode] = createSignal<ViewportMode>('3d')
  const [eraserRadius, setEraserRadius] = createSignal(0.18)
  const [brushStrength, setBrushStrength] = createSignal(1)
  const [pointerLabel, setPointerLabel] = createSignal('Ready')
  const {
    activeDrawing,
    activeLayer,
    activeMaterial,
    activeWorkplaneId,
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
    workplanes,
  } = useDocumentSession(mode)
  const { cameraState, renderer, status, zoom } = useGreaseRenderer({
    canvas: () => canvasRef,
    activeWorkplaneId,
    draftStroke,
    pointOverlays,
    renderLayers,
    selectedStrokeIds,
    viewportMode,
    workplane,
  })

  const canvasInteraction = useCanvasInteraction({
    canvas: () => canvasRef,
    renderer,
    mode,
    viewportMode,
    activeLayer,
    activeDrawing,
    activeMaterial,
    workplane,
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

  const setViewCubeTarget = (
    target: ViewCubeTarget,
    options?: ViewCubeActionOptions,
  ) => {
    setViewportMode('3d')
    renderer()?.setViewDirection(target.direction, options?.animate)
  }

  const resetViewCubeHome = (options?: ViewCubeActionOptions) => {
    setViewportMode('3d')
    renderer()?.resetView(options?.animate)
  }

  const orbitViewCube = (deltaX: number, deltaY: number) => {
    setViewportMode('3d')
    const activeRenderer = renderer()
    if (!activeRenderer) return
    if (activeRenderer.camera.mode !== '3d') {
      activeRenderer.setViewportMode('3d', workplane())
    }
    activeRenderer.orbit(deltaX, deltaY)
  }

  const rollViewCube = (
    angle: number,
    options?: ViewCubeActionOptions,
  ) => {
    renderer()?.rollView(angle, options?.animate)
  }

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
        viewportMode={viewportMode()}
        onDeleteSelection={canvasInteraction.deleteCurrentSelection}
        onSetBrushStrength={setBrushStrength}
        onSetEraserRadius={setEraserRadius}
        onSetMode={setMode}
        onSetViewportMode={setViewportMode}
        updateDocument={updateDocument}
      />

      <section class="workspace">
        <CanvasViewport
          animateViewCube
          camera={cameraState()}
          canvasRef={(canvas) => {
            canvasRef = canvas
          }}
          details={`Frame ${documentState().currentFrame} · ${
            activeLayer()?.name ?? 'No layer'
          } · ${strokeCount()} strokes · ${pointCount()} points · ${selectedStrokeCount()} strokes selected · ${selectedPointCount()} points selected · ${pointerLabel()}`}
          status={status()}
          viewCubeFocalLength="34rem"
          onHomeView={resetViewCubeHome}
          onOrbitView={orbitViewCube}
          onPointerDown={canvasInteraction.onPointerDown}
          onPointerMove={canvasInteraction.onPointerMove}
          onPointerUp={canvasInteraction.onPointerUp}
          onPointerCancel={canvasInteraction.onPointerUp}
          onRollView={rollViewCube}
          onSetViewCubeTarget={setViewCubeTarget}
          onWheel={(event) => {
            event.preventDefault()
            zoom(event.deltaY)
          }}
        />

        <AppSidebar
          activeLayerId={documentState().activeLayerId}
          activeMaterial={activeMaterial()}
          activeMaterialId={documentState().activeMaterialId}
          activeWorkplaneId={activeWorkplaneId()}
          canMoveLayerTowardBottom={canMoveLayerTowardBottom}
          canMoveLayerTowardTop={canMoveLayerTowardTop}
          countVisibleStrokes={countVisibleStrokes}
          layersTopFirst={layersTopFirst()}
          materials={materials()}
          onionSkin={onionSkin()}
          updateDocument={updateDocument}
          workplane={workplane()}
          workplanes={workplanes()}
        />
      </section>
    </main>
  )
}

export default App
