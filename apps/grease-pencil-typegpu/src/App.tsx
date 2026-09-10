import type { ViewNavigation } from '@app-game/solid-view-cube';
import { createSignal, onSettled } from 'solid-js';
import { AppSidebar } from './app/AppSidebar';
import { AppToolbar } from './app/AppToolbar';
import { useDocumentSession } from './app/useDocumentSession';
import { useGreaseRenderer } from './app/useGreaseRenderer';
import { useSelectionShortcuts } from './app/useSelectionShortcuts';
import { useCanvasInteraction } from './features/interaction/useCanvasInteraction';
import { CanvasViewport } from './features/viewport/CanvasViewport';
import styles from './App.module.css';
import type { WorkplaneGizmoMode } from './render/workplaneGizmoTypes';
import type { SketchPanel } from './shared/sketchPanel';
import type { ToolMode } from './shared/toolMode';
import type { ViewportMode } from './shared/viewportMode';

/** Sketchbook workspace with a shared canvas across desktop and touch layouts. */
export default function App() {
  let canvasRef!: HTMLCanvasElement;

  const [mode, setMode] = createSignal<ToolMode>('draw');
  const [gizmoMode, setGizmoMode] = createSignal<WorkplaneGizmoMode>('translate');
  const [viewportMode, setViewportMode] = createSignal<ViewportMode>('2d');
  const [touchDrawingByView, setTouchDrawingByView] = createSignal({ '2d': false, '3d': false });
  const touchDrawing = () => touchDrawingByView()[viewportMode()];
  const [panel, setPanel] = createSignal<SketchPanel>();
  const [eraserRadius, setEraserRadius] = createSignal(0.18);
  const [brushStrength, setBrushStrength] = createSignal(1);
  const [, setPointerLabel] = createSignal('Ready');
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
    updateDocument,
    workplane,
    workplanes
  } = useDocumentSession(mode);
  const { cameraState, renderer, status, zoom } = useGreaseRenderer({
    canvas: () => canvasRef,
    activeWorkplaneId,
    draftStroke,
    pointOverlays,
    renderLayers,
    selectedStrokeIds,
    viewportMode,
    gizmoMode,
    workplane
  });

  const canvasInteraction = useCanvasInteraction({
    camera: cameraState,
    touchDrawing,
    documentState,
    canvas: () => canvasRef,
    renderer,
    mode,
    viewportMode,
    gizmoMode,
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
    setPointerLabel
  });

  useSelectionShortcuts({
    deleteSelectedPoints: canvasInteraction.deleteSelectedPoints,
    deleteSelectedStrokes: canvasInteraction.deleteSelectedStrokes,
    selectedPointKeys,
    selectedStrokeIds
  });

  const closePanel = () => {
    const launcher = document.querySelector<HTMLButtonElement>('[data-quick-tools]');
    setPanel(undefined);
    launcher?.focus();
  };

  onSettled(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && panel()) closePanel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const navigateViewCube = (request: ViewNavigation) => {
    if ('phase' in request && (request.phase === 'end' || request.phase === 'cancel')) return;
    if (request.source !== 'roll' && request.source !== 'roll-drag') setViewportMode('3d');
    renderer()?.navigateView(request);
  };

  const resetViewCubeHome = () => {
    setViewportMode('3d');
    renderer()?.resetView(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  };

  return (
    <main class={styles.root} data-panel-open={Boolean(panel())} data-tool={mode()}>
      <AppToolbar
        touchDrawing={touchDrawing()}
        onSetTouchDrawing={(enabled) => setTouchDrawingByView((current) => ({ ...current, [viewportMode()]: enabled }))}
        panel={panel()}
        onSetPanel={setPanel}
        canUndo={Boolean(activeDrawing()?.strokes.length) && !activeLayer()?.locked}
        activeMaterial={activeMaterial()}
        brushStrength={brushStrength()}
        canDeleteSelection={selectedStrokeCount() > 0 || selectedPointCount() > 0}
        eraserRadius={eraserRadius()}
        mode={mode()}
        viewportMode={viewportMode()}
        onDeleteSelection={canvasInteraction.deleteCurrentSelection}
        onSetBrushStrength={setBrushStrength}
        onSetEraserRadius={setEraserRadius}
        onSetMode={setMode}
        onSetViewportMode={setViewportMode}
        onResetView={() =>
          viewportMode() === '2d' ? renderer()?.setViewportMode('2d', workplane(), true) : resetViewCubeHome()
        }
        updateDocument={updateDocument}
      />

      <section class={styles.workspace}>
        <CanvasViewport
          workplane={workplane()}
          gizmoMode={gizmoMode()}
          onSetGizmoMode={setGizmoMode}
          animateViewCube
          renderer={renderer()}
          camera={cameraState()}
          canvasRef={(canvas) => {
            canvasRef = canvas;
          }}
          viewportMode={viewportMode()}
          status={status()}
          onHomeView={resetViewCubeHome}
          onPointerDown={canvasInteraction.onPointerDown}
          onPointerMove={canvasInteraction.onPointerMove}
          onPointerUp={canvasInteraction.onPointerUp}
          onPointerCancel={canvasInteraction.onPointerCancel}
          onNavigateView={navigateViewCube}
          onWheel={(event) => {
            event.preventDefault();
            zoom(event.deltaY);
          }}
        />

        <AppSidebar
          panel={panel()}
          onClose={closePanel}
          currentFrame={documentState().currentFrame}
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
  );
}
