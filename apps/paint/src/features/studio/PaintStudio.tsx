import { blockEraserSize, isBlockEraser } from '@app-game/abr-brush/blockEraser';
import { record } from '@app-game/abr-brush/form';
import { NavigationPuck } from '@app-game/navigation-puck';
import { screenToWorld, worldToScreen, type Point } from '@app-game/paint-core/camera';
import { supportsPaintSymmetry } from '@app-game/paint-core/symmetry';
import type { JSX } from '@solidjs/web';
import { createEffect, createSignal, Match, Show, Switch } from 'solid-js';
import type { PaintError } from '../../shared/errors';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import { AbrViewerDialog, clearAbrBrush, createAbrPresets } from '../abr';
import {
  BrushAdjustHud,
  BrushLibraryPanel,
  clearRoundBrush,
  createBrushAdjust,
  createBrushTools,
  createMixerBrush,
  MixerActions,
  type PaintTool
} from '../brush';
import { createBrushLibrary, createBrushStorage, createPresetUploads, createRecentPresets } from '../brush-library';
import { createPaintCamera, createViewSize } from '../camera';
import { BrushCursor, CanvasDebug, firstCanvasAction, PaintCanvas, type CanvasInput } from '../canvas';
import { ColorPanel, ColorPickerLoupe, ColorPickerSettings, createCanvasColorPicker } from '../color';
import { ColorWheel, createColorWheelSettings } from '../color-wheel';
import { createDeveloperSettings, DeveloperDialog } from '../developer';
import { createPaintEngine } from '../engine';
import { createFill, FillPanel } from '../fill';
import { createFrames, FrameEditor, FrameGuides, frameRegion, FramesSection } from '../frames';
import { createGradient, GradientPanel, GradientPreview } from '../gradient';
import { createImagePlacement, createLayerFilter, HistorySourceControl, LayersPanel } from '../layers';
import { createPerformanceMonitor, PerformancePanel } from '../performance';
import { createRadialMenu, RadialMenu, radialLayout, type RadialItem } from '../radial-menu';
import { createInputRecorder, RecordingControls } from '../recording';
import { createSelection, createSelectionView, guardEdits, SelectionActions } from '../selection';
import { createSymmetry, SymmetryGuide, SymmetryPanel } from '../symmetry';
import { createTransform, TransformOverlay } from '../transform';
import { createFullscreenToggle } from './createFullscreenToggle';
import { createPaintShortcuts } from './createPaintShortcuts';
import { DrawingMenu } from './DrawingMenu';
import { ErrorNotice } from './ErrorNotice';
import styles from './PaintStudio.module.css';
import { panelTitles, StudioPanel, type PanelId } from './StudioPanel';
import { ToolBar } from './ToolBar';
import { ViewControls } from './ViewControls';

/**
 * Paint Studio: a full-window infinite canvas with on-demand controls; opening panels never resizes the drawing
 * surface. This is the editor's layout: it creates the engine, camera, tools and selection once and passes each part
 * of the UI the state it works on. Switching between worker and main-thread execution replaces only the canvas.
 */
export function PaintStudio(props: {
  /** Link back to the embedding playground; omitted in the standalone app. */
  experimentsHref?: string;
  /** Host-specific controls shown in the drawing menu. */
  applicationControls?: JSX.Element;
}) {
  const [editor, setEditor] = createSignal<HTMLDivElement>();
  const [stage, setStage] = createSignal<HTMLElement>();
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement>();
  const [error, setError] = createSignal<PaintError>();
  const [cursor, setCursor] = createSignal<Point>();

  const developer = createDeveloperSettings();
  const brushStorage = createBrushStorage({ onError: setError });
  const library = createBrushLibrary({ storage: brushStorage });
  const tools = createBrushTools({
    library,
    storage: brushStorage,
    clear: (brush) => (brush.engine?.id === 'abr' ? clearAbrBrush(brush) : clearRoundBrush(brush))
  });
  const engine = createPaintEngine({
    settings: developer,
    onError: setError,
    onSelection: (event) => selection.receive(event),
    prepare: () => uploads.restore(),
    frames: { enabled: developer.performanceMonitor, receive: (event) => monitor.record(event) }
  });
  const selection = createSelection({ send: engine.send, document: engine.state, ready: engine.canEdit });
  createSelectionView({ points: selection.points, ready: engine.canEdit, send: engine.send });
  /** Sends document commands, respecting a pending selection edit and clearing the outline where needed. */
  const guarded = guardEdits(selection, engine.send);
  /**
   * Sends document commands. While transforming, Undo cancels the transform and other document changes wait for it
   * to be applied or cancelled, so the transform stays one undo step.
   */
  const edit: typeof guarded = (command) => {
    recorder.command(command);
    if (transform.active()) {
      if (command.type === 'undo') {
        void transform.cancel();
      }

      if (!allowedWhileTransforming.has(command.type)) {
        return;
      }
    }

    guarded(command);
  };
  const size = createViewSize(stage);
  const monitor = createPerformanceMonitor({ enabled: developer.performanceMonitor, label: engine.mode, size });
  const camera = createPaintCamera({
    restored: () => engine.restored()?.camera,
    size,
    ready: engine.canEdit,
    send: engine.send,
    bounds: () => canvas()?.getBoundingClientRect(),
    puck: { size: radialLayout.puck, reach: radialLayout.reach }
  });
  const symmetry = createSymmetry({
    restored: () => engine.restored()?.features,
    canUpdate: canUpdateSymmetry,
    send: engine.send
  });
  const mixer = createMixerBrush({
    brush: tools.brush,
    tool: tools.tool,
    run: engine.runBrushCommand,
    canRun: () => canChangeBrush() && !uploads.isBusy(),
    onError: setError
  });
  const uploads = createPresetUploads({
    resources: library.resources,
    upload: engine.putResources,
    canChange: canChangeBrush,
    select: tools.selectPreset,
    inUse: tools.presets,
    onUnavailable(preset, error) {
      tools.abandonPreset(preset.id);
      setError(error);
    },
    loaded: tools.loaded
  });
  const presets = createAbrPresets({
    library,
    choose: (preset) => uploads.choose(preset, tools.slot()),
    canChange: () => canChangeBrush() && !uploads.isBusy()
  });
  const brushAdjust = createBrushAdjust({
    brush: tools.brush,
    update: tools.updateBrush,
    available: () => paintsWithBrush() && !transform.active() && canChangeBrush()
  });
  const colorPicker = createCanvasColorPicker({
    paints: () => paintsColor(),
    toScreen: (point) => worldToScreen(point, camera.current(), size()),
    pick: engine.pickColor,
    current: () => brush().color,
    apply: (color) => tools.updateBrush({ color }),
    onError: setError
  });
  const images = createImagePlacement({
    canPlace: () => engine.canEdit() && !selection.isBusy() && !engine.isDrawing(),
    view: () => {
      const view = size();
      const current = camera.current();
      // Leave a margin, so an image larger than the view does not touch its edges.
      return {
        center: screenToWorld({ x: view.width / 2, y: view.height / 2 }, current, view),
        fit: { width: (view.width * 0.9) / current.zoom, height: (view.height * 0.9) / current.zoom }
      };
    },
    send: edit
  });
  const fill = createFill({
    active: () => tools.tool() === 'fill',
    color: () => tools.brush().color,
    area: visibleArea,
    selection: selection.points,
    canFill: () => engine.canEdit() && !selection.isBusy() && !engine.isDrawing(),
    send: edit
  });
  const gradient = createGradient({
    active: () => tools.tool() === 'gradient',
    colors: () => ({ foreground: tools.brush().color, background: tools.brush().backgroundColor ?? '#ffffff' }),
    area: visibleArea,
    selection: selection.points,
    canDraw: () => engine.canEdit() && !selection.isBusy() && !engine.isDrawing(),
    send: edit
  });
  const transform = createTransform({
    run: engine.runEdit,
    selection: selection.points,
    canStart: () => engine.canEdit() && !selection.isBusy() && !engine.isDrawing(),
    onStart: () => selection.replace([]),
    onSelection: selection.replace,
    onError: setError
  });
  const fullscreen = createFullscreenToggle(editor, setError);
  const colorWheel = createColorWheelSettings();
  const frames = createFrames({
    restored: () => engine.restored()?.features,
    canUpdate: canUpdateSymmetry,
    send: engine.send,
    navigate: camera.navigate,
    camera: camera.camera,
    size,
    selection: selection.points
  });
  const layerFilter = createLayerFilter({
    layers: () => engine.state().layers,
    activeId: () => engine.state().activeId,
    // In a frame, the layers with paint in it; otherwise those in view.
    inView: () => (frames.activeFrame() ? (engine.layersInRegions()[frameRegion] ?? []) : engine.layersInView()),
    camera: camera.camera
  });
  const recentPresets = createRecentPresets({ current: tools.preset, exists: (id) => library.find(id) !== undefined });
  const radial = createRadialMenu({
    center: camera.navigation.center,
    items: radialItems,
    close: camera.navigation.close
  });
  // Recent user presets are listed once the library has read its presets.
  createEffect(
    () => camera.navigation.center() !== undefined,
    (open) => {
      if (open) {
        void library.loadAll();
      }
    }
  );
  const recorder = createInputRecorder({
    exportFile: engine.exportFile,
    observe: () => ({
      ready: ready(),
      tool: tool(),
      brush: { preset: tools.preset(), size: brush().size, opacity: brush().opacity, color: brush().color },
      panel: panel(),
      camera: camera.camera(),
      transforming: transform.active(),
      selection: { points: selection.points().length, busy: selection.busy(), drawing: selection.drawing() },
      document: {
        layers: engine.state().layers.length,
        activeId: engine.state().activeId,
        canUndo: engine.state().canUndo,
        canRedo: engine.state().canRedo
      },
      error: error()?.message
    })
  });

  const { brush, tool } = tools;
  const { ready } = engine;
  const [panel, setPanel] = createSignal<PanelId>();
  const [abrOpen, setAbrOpen] = createSignal(false);
  const [abrMounted, setAbrMounted] = createSignal(false);
  const [developerOpen, setDeveloperOpen] = createSignal(false);
  /** The active frame shows handles for changing its rectangle; ends when another frame or none becomes active. */
  const [adjustingFrame, setAdjustingFrame] = createSignal<string>();
  /** The control that opened the current panel or dialog; focus returns to it on close. */
  let launcher: HTMLElement | undefined;

  const blockCursor = () =>
    brush().engine?.id === 'abr' && isBlockEraser(record(record(brush().engine?.settings).values).tool);
  const cursorSize = () => (blockCursor() ? blockEraserSize : Math.max(2, brush().size * camera.camera().zoom));
  const input: CanvasInput = {
    camera: camera.current,
    size,
    brush,
    eraser: tools.eraser,
    ready: () => engine.canEdit() && !selection.isBusy() && !uploads.isBusy(),
    navigate: camera.navigate,
    send(command) {
      // Input never starts an engine; `init` belongs to the transport.
      if (command.type !== 'init') {
        edit(command);
      }
    },
    cursor: setCursor,
    showPenCursor: developer.showPenCursor,
    rawUpdate: developer.markRawReceived,
    // The Mixer Brush loads paint with Alt/Option; other painting tools pick a color.
    canvasAction: firstCanvasAction(
      // Alt/Option picks colors even while transforming; the transform then consumes other contacts.
      colorPicker.canvasAction,
      transform.canvasAction,
      mixer.canvasAction,
      fill.canvasAction,
      gradient.canvasAction
    ),
    adjust: brushAdjust.adjust,
    touchGestures: {
      tap(fingers) {
        if (fingers === 2 && engine.state().canUndo) {
          edit({ type: 'undo' });
        }

        if (fingers === 3 && engine.state().canRedo) {
          edit({ type: 'redo' });
        }
      },
      hold: colorPicker.hold
    },
    puck: camera.navigation,
    puckPicker: radial.picker,
    selection: { ...selection, enabled: () => tool() === 'lasso' }
  };

  createPaintShortcuts({
    closePanel() {
      if (!panel()) {
        return false;
      }

      closePanel();
      return true;
    },
    tool,
    chooseTool,
    selectionAction: selection.action,
    deselect: selection.clear,
    undo: () => edit({ type: 'undo' }),
    redo: () => edit({ type: 'redo' }),
    save: () => edit({ type: 'download' }),
    swapColors: tools.swapColors,
    resetColors: tools.resetColors,
    scaleBrush: tools.scaleSize,
    zoomBy: camera.zoomBy,
    resetZoom: camera.resetZoom,
    transform: toggleTransform,
    confirm() {
      if (!transform.active()) {
        return false;
      }

      void transform.end();
      return true;
    },
    cancel() {
      void transform.cancel();
      mixer.cancelPick();
      colorPicker.cancel();
      camera.navigation.close();
      selection.clear();
      edit({ type: 'cancel' });
    }
  });

  /** Symmetry may change: the engine accepts commands and no selection edit is waiting for it. */
  function canUpdateSymmetry() {
    return engine.canEdit() && !selection.busy();
  }

  /** Brush settings may change: no stroke, selection edit, brush command or preset upload is running. */
  function canChangeBrush() {
    return engine.canEdit() && !selection.isBusy() && !engine.isDrawing() && !engine.isCommandBusy();
  }

  /** Switches tools, applying a transform in progress; choosing the active tool again keeps the lasso outline. */
  function chooseTool(next: PaintTool) {
    if (transform.active()) {
      void transform.end();
    }

    if (selection.isBusy() || next === tools.tool()) {
      return;
    }

    mixer.cancelPick();
    colorPicker.cancel();
    selection.clear();
    tools.chooseTool(next);
  }

  /** Starts transforming the selection or the active layer, or applies the transform in progress. */
  function toggleTransform() {
    if (transform.active()) {
      void transform.end();
      return;
    }

    mixer.cancelPick();
    colorPicker.cancel();
    void transform.start();
  }

  /**
   * Switches the execution mode unless a selection edit, preset upload or brush command must finish first. An engine
   * that is not ready cannot checkpoint, so it is restarted in the other mode from the saved document instead.
   */
  function setWorkerEnabled(enabled: boolean) {
    if (selection.isBusy() || uploads.isBusy() || engine.isCommandBusy()) {
      return;
    }

    const next = enabled ? 'worker' : 'main';
    if (engine.switchMode(next) || engine.restart(next)) {
      mixer.cancelPick();
      colorPicker.cancel();
      setCursor(undefined);
      camera.navigation.close();
    }
  }

  function togglePanel(next: PanelId, target: HTMLElement) {
    launcher = target;
    camera.navigation.close();
    setPanel(panel() === next ? undefined : next);
  }

  function closePanel() {
    setPanel(undefined);
    launcher?.focus({ preventScroll: true });
  }

  /** Opens the settings of the active tool: the fill panel for the fill, otherwise the brush panel and its presets. */
  function openBrushSettings(target: HTMLElement) {
    if (tool() === 'fill' || tool() === 'gradient') {
      togglePanel(tool() as 'fill' | 'gradient', target);
      return;
    }

    void library.loadAll();
    togglePanel('brush', target);
  }

  /** Opens the ABR viewer from the brush panel; focus returns to the brush settings button when it closes. */
  function openAbrViewer() {
    setPanel(undefined);
    camera.navigation.close();
    setAbrMounted(true);
    setAbrOpen(true);
  }

  /** Uploads a preset's images if needed and makes the brush tool `slot`, the active one by default, use it. */
  async function choosePreset(id: string, slot = tools.slot()) {
    const preset = library.find(id);
    if (!preset) {
      return;
    }

    mixer.cancelPick();
    colorPicker.cancel();
    const chosen = await uploads.choose(preset, slot);
    if (chosen.isErr() && chosen.error.kind !== 'aborted') {
      setError(chosen.error);
    }
  }

  return (
    <div ref={setEditor} class={styles.studio}>
      <main
        ref={[setStage, images.ref]}
        class={styles.stage}
        aria-label="Drawing workspace"
        data-picking={mixer.picking() || colorPicker.armed()}
        data-dropping={images.isOver()}
      >
        <Show when={engine.session()} keyed>
          {(session) => (
            <PaintCanvas
              connect={(element) => engine.connect(element, session.mode)}
              input={input}
              crosshair={tool() === 'lasso' || tool() === 'fill' || tool() === 'gradient'}
              ref={setCanvas}
            />
          )}
        </Show>
        <FrameGuides
          frames={frames.frames()}
          activeId={frames.activeFrame()?.id}
          toScreen={(point) => worldToScreen(point, camera.camera(), size())}
        />
        <Show when={frames.activeFrame()?.id === adjustingFrame() && frames.activeFrame()} keyed>
          {(frame) => (
            <FrameEditor
              frame={frame}
              toScreen={(point) => worldToScreen(point, camera.camera(), size())}
              toDocument={(point) => screenToWorld(point, camera.current(), size())}
              onChange={(rect) => frames.resize(frame.id, rect)}
              size={size()}
              onDone={() => setAdjustingFrame(undefined)}
            />
          )}
        </Show>
        <SymmetryGuide
          symmetry={symmetry.symmetry()}
          camera={camera.camera()}
          size={size()}
          active={supportsSymmetry()}
        />
        <Show when={developer.debug()}>
          <CanvasDebug
            tiles={engine.debugTiles()}
            paging={engine.paging()}
            camera={camera.camera()}
            size={size()}
            document={engine.state()}
            gpuBytes={engine.metrics().gpu}
          />
        </Show>
        <Show when={developer.performanceMonitor()}>
          <PerformancePanel samples={monitor.samples()} idle={monitor.idle()} />
        </Show>
        <Show when={ready() && engine.state().tileCount === 0}>
          <div class={styles.welcome}>
            <p>Pen to draw. Touch to move.</p>
          </div>
        </Show>
        <Show when={brushAdjust.anchor()}>
          {(anchor) => (
            <BrushAdjustHud
              anchor={anchor()}
              size={brush().size}
              opacity={brush().opacity}
              color={brush().color}
              zoom={camera.camera().zoom}
            />
          )}
        </Show>
        <Show when={transform.bounds()}>
          {(bounds) => (
            <TransformOverlay
              bounds={bounds()}
              box={transform.box()}
              settings={transform.settings()}
              size={size()}
              toScreen={(point) => worldToScreen(point, camera.camera(), size())}
              toDocument={(point) => screenToWorld(point, camera.current(), size())}
              onChange={transform.setBox}
              onSettings={transform.setSettings}
              onFlip={transform.flip}
              onRotate={transform.rotate}
              onDistort={transform.distort}
              onReset={transform.reset}
              onCancel={() => void transform.cancel()}
              onDone={() => void transform.end()}
            />
          )}
        </Show>
        <Show when={ready() && paintsWithBrush() && !transform.active() && !colorPicker.preview() && cursor()}>
          {(point) => <BrushCursor point={point()} size={cursorSize()} square={blockCursor()} />}
        </Show>
        <Show when={colorPicker.preview()}>{(preview) => <ColorPickerLoupe preview={preview()} />}</Show>
        <Show when={gradient.preview()}>
          {(command) => (
            <GradientPreview
              command={command()}
              toScreen={(point) => worldToScreen(point, camera.camera(), size())}
              size={size()}
            />
          )}
        </Show>
        <Show when={camera.navigation.center()}>
          {(center) => (
            <NavigationPuck navigation={camera.navigation} focusTarget={() => canvas()!}>
              <RadialMenu
                center={center()}
                items={radialItems()}
                highlighted={radial.highlighted()}
                hidden={camera.navigation.activeAction() !== undefined}
                onChoose={radial.choose}
              />
            </NavigationPuck>
          )}
        </Show>
        <Show when={mixer.picking()}>
          <div class={styles.welcome} role="status">
            <p>Tap the canvas to load paint. Escape to cancel.</p>
          </div>
        </Show>
      </main>
      <Show when={abrMounted()}>
        <AbrViewerDialog
          open={abrOpen()}
          close={() => {
            setAbrOpen(false);
            launcher?.focus();
          }}
          mixing={brush().mixing}
          onMixingChange={(mixing) => tools.updateBrush({ mixing })}
          onUseBrush={(asset) => {
            mixer.cancelPick();
            colorPicker.cancel();
            return presets.useBrush(asset);
          }}
        />
      </Show>
      <div class={styles.ui}>
        <span class={styles.saveState} role="status" title={saveStatus[engine.saveState()].title}>
          {ready() ? saveStatus[engine.saveState()].label : 'Preparing drawing…'}
        </span>
        <ViewControls
          fullscreen={fullscreen}
          zoom={camera.camera().zoom}
          angle={camera.camera().angle}
          onZoomBy={camera.zoomBy}
          onResetZoom={camera.resetZoom}
          onResetRotation={camera.resetRotation}
        />
        <ToolBar
          tool={tool()}
          mirrored={camera.camera().mirrored}
          symmetry={symmetry.symmetry().mode !== 'off'}
          panel={panel()}
          transforming={transform.active()}
          onTransform={toggleTransform}
          onChooseTool={chooseTool}
          onToggleMirror={camera.toggleMirror}
          onTogglePanel={togglePanel}
        />
        <Show when={tool() === 'lasso' && !transform.active()}>
          <SelectionActions
            outline={
              selection.drawing()
                ? []
                : selection.points().map((point) => worldToScreen(point, camera.camera(), size()))
            }
            size={size()}
            disabled={!ready() || selection.drawing()}
            busy={selection.busy()}
            hasClipboard={selection.hasClipboard()}
            onAction={selection.action}
            onTransform={toggleTransform}
            onDeselect={selection.clear}
          />
        </Show>
        <div class={styles.doublePuck} aria-label="Brush and color">
          <button
            aria-label="Brush settings"
            title="Brush settings"
            aria-expanded={panel() === 'brush' || panel() === 'fill' || panel() === 'gradient' ? 'true' : 'false'}
            aria-controls="paint-panel"
            onClick={(event) => openBrushSettings(event.currentTarget)}
          >
            <SketchIcon
              name={
                tool() === 'fill' || tool() === 'gradient'
                  ? tool() as 'fill' | 'gradient'
                  : tool() === 'eraser'
                    ? 'erase'
                    : brush().engine?.id === 'abr'
                      ? 'brush'
                      : 'draw'
              }
              size={22}
            />
            <small>{blockCursor() ? 'Block' : Math.round(brush().size)}</small>
          </button>
          <button
            class={styles.colorLauncher}
            aria-label="Color palette"
            title="Color palette"
            aria-expanded={panel() === 'color' ? 'true' : 'false'}
            aria-controls="paint-panel"
            onClick={(event) => togglePanel('color', event.currentTarget)}
          >
            <span style={{ background: brush().color }} />
          </button>
        </div>
        <div class={styles.history}>
          <button
            class={styles.floating}
            aria-label="Undo"
            aria-keyshortcuts="Control+Z Meta+Z"
            title="Undo · ⌘/Ctrl Z"
            disabled={!engine.state().canUndo || !ready()}
            onClick={() => edit({ type: 'undo' })}
          >
            <SketchIcon name="undo" />
          </button>
          <button
            class={`${styles.floating} ${styles.redo}`}
            aria-label="Redo"
            aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z"
            title="Redo · ⌘/Ctrl Shift Z"
            disabled={!engine.state().canRedo || !ready()}
            onClick={() => edit({ type: 'redo' })}
          >
            <SketchIcon name="undo" />
          </button>
        </div>
        <button
          class={`${styles.menuTrigger} ${styles.floating}`}
          aria-label="Drawing menu"
          title="Drawing menu"
          aria-expanded={panel() === 'file' ? 'true' : 'false'}
          aria-controls="paint-panel"
          onClick={(event) => togglePanel('file', event.currentTarget)}
        >
          <SketchIcon name="tools" />
        </button>
        <button
          class={`${styles.navTrigger} ${styles.floating}`}
          aria-label="Navigation and quick actions"
          title="Navigation and quick actions · hold Space / V / right click or the pen button"
          onClick={() => {
            setPanel(undefined);
            camera.navigation.open();
          }}
        >
          <SketchIcon name="pan" />
        </button>
        <Show when={recorder.status() !== 'idle' || recorder.saved()}>
          <RecordingControls recorder={recorder} />
        </Show>
        <Show when={panel()} keyed>
          {(id) => (
            <StudioPanel id={id} title={panelTitles[id]} onClose={closePanel}>
              <Switch>
                <Match when={id === 'symmetry'}>
                  <SymmetryPanel
                    symmetry={symmetry.symmetry()}
                    disabled={!canUpdateSymmetry()}
                    inactive={!supportsSymmetry()}
                    viewCenter={camera.camera()}
                    onChange={symmetry.update}
                  />
                </Match>
                <Match when={id === 'brush'}>
                  <BrushLibraryPanel
                    presets={library.presets()}
                    preset={tools.preset()}
                    changed={(id) => tools.changes(id) !== undefined}
                    brush={brush()}
                    disabled={!ready() || uploads.busy()}
                    onChange={tools.updateBrush}
                    onSelect={(id) => void choosePreset(id)}
                    onReset={tools.resetPreset}
                    onSave={tools.savePreset}
                    onSaveAs={(name, groups) => void tools.savePresetAs(name, groups)}
                    onRename={(id, name) => library.update(id, { name })}
                    onDelete={tools.deletePreset}
                    sharedSize={tools.sharedSize()}
                    onSharedSizeChange={tools.setSharedSize}
                    onOpenAbr={openAbrViewer}
                    eraser={
                      tool() === 'eraser'
                        ? {
                            mode: tools.eraserMode(),
                            canClear: tools.canClear(),
                            onModeChange: tools.setEraserMode
                          }
                        : undefined
                    }
                  />
                </Match>
                <Match when={id === 'fill'}>
                  <FillPanel settings={fill.settings()} onChange={fill.update} />
                </Match>
                <Match when={id === 'gradient'}>
                  <GradientPanel
                    settings={gradient.settings()}
                    colors={{ foreground: brush().color, background: brush().backgroundColor ?? '#ffffff' }}
                    onChange={gradient.update}
                  />
                </Match>
                <Match when={id === 'color'}>
                  <ColorPanel
                    brush={brush()}
                    onChange={tools.updateBrush}
                    onPickCanvas={() => {
                      colorPicker.arm();
                      closePanel();
                    }}
                    alternative={{
                      label: 'Wheel',
                      shown: colorWheel.settings().picker === 'wheel',
                      onShownChange: (shown) => colorWheel.update({ picker: shown ? 'wheel' : 'square' }),
                      render: (control) => (
                        <ColorWheel
                          color={control.color}
                          onChange={control.onChange}
                          onSettle={control.onSettle}
                          settings={colorWheel.settings()}
                          onSettings={colorWheel.update}
                        />
                      )
                    }}
                  />
                  <ColorPickerSettings
                    source={colorPicker.settings.source()}
                    size={colorPicker.settings.size()}
                    onChange={colorPicker.settings.update}
                  />
                  <Show when={mixer.available()}>
                    <MixerActions
                      disabled={!ready() || engine.commandBusy()}
                      onLoad={() => void mixer.command('load')}
                      onClean={() => void mixer.command('clean')}
                      onPick={() => {
                        mixer.pick();
                        closePanel();
                      }}
                    />
                  </Show>
                </Match>
                <Match when={id === 'layers'}>
                  <FramesSection
                    frames={frames.frames()}
                    active={frames.activeFrame()}
                    disabled={!canUpdateSymmetry()}
                    onActivate={frames.activate}
                    onAdd={() => frames.add()}
                    onRename={frames.rename}
                    adjusting={adjustingFrame() !== undefined && adjustingFrame() === frames.activeFrame()?.id}
                    onAdjust={(adjusting) => setAdjustingFrame(adjusting ? frames.activeFrame()?.id : undefined)}
                    onGoTo={frames.goTo}
                    onExport={({ left, top, width, height, name }) =>
                      edit({ type: 'png', region: { left, top, width, height }, name: `${name}.png` })
                    }
                    onCopyLink={(id) =>
                      navigator.clipboard.writeText(frames.linkTo(id)).then(
                        () => true,
                        () => false
                      )
                    }
                    onRemove={frames.remove}
                  />
                  <LayersPanel
                    state={engine.state()}
                    ready={ready()}
                    onAction={(action) => edit({ type: 'layer', action })}
                    filter={{
                      shown: layerFilter.shown,
                      where: frames.activeFrame() ? `in ${frames.activeFrame()!.name}` : 'in view',
                      offScreen: layerFilter.offScreen(),
                      showAll: layerFilter.showAll(),
                      onShowAllChange: layerFilter.setShowAll
                    }}
                  />
                  <HistorySourceControl
                    state={engine.state()}
                    ready={ready()}
                    onChange={(id) => edit({ type: 'history-source', id })}
                  />
                </Match>
                <Match when={id === 'file'}>
                  <DrawingMenu
                    ready={ready()}
                    onOpen={(file) => {
                      edit({ type: 'import', file });
                      closePanel();
                    }}
                    onPlaceImage={(file) => {
                      images.place(file);
                      closePanel();
                    }}
                    onSave={() => {
                      edit({ type: 'download' });
                      closePanel();
                    }}
                    onExportPng={() => {
                      edit({ type: 'png' });
                      closePanel();
                    }}
                    onResetView={() => {
                      camera.reset();
                      closePanel();
                    }}
                    onDeveloper={() => {
                      closePanel();
                      setDeveloperOpen(true);
                    }}
                    applicationControls={props.applicationControls}
                    experimentsHref={props.experimentsHref}
                  />
                </Match>
              </Switch>
            </StudioPanel>
          )}
        </Show>
      </div>
      <Show when={developerOpen()}>
        <DeveloperDialog
          settings={developer}
          ready={ready()}
          workerEnabled={engine.mode() === 'worker'}
          switching={engine.switching()}
          metrics={engine.metrics()}
          onWorkerEnabledChange={setWorkerEnabled}
          onRecordInput={
            import.meta.env.DEV
              ? () => {
                  setDeveloperOpen(false);
                  recorder.start();
                }
              : undefined
          }
          close={() => {
            setDeveloperOpen(false);
            launcher?.focus({ preventScroll: true });
          }}
        />
      </Show>
      <Show when={error()}>
        {(current) => (
          <ErrorNotice
            error={current()}
            onRestore={() => {
              setError(undefined);
              edit({ type: 'recover' });
            }}
            onRestart={() => engine.restart()}
            onDismiss={() => setError(undefined)}
          />
        )}
      </Show>
    </div>
  );

  /**
   * The tool paints color, so Alt/Option-click picks a color: the fill, and round and textured presets and ABR Brush
   * or Pencil presets. ABR erasers keep Alt for erasing to history, and the Mixer Brush for loading paint.
   */
  function paintsColor() {
    if (tool() === 'fill' || tool() === 'gradient') {
      return true;
    }

    if (tool() !== 'brush') {
      return false;
    }

    const abrTool = record(record(record(brush().engine?.settings).values).tool).type;
    return brush().engine?.id !== 'abr' || abrTool === 'PbTl' || abrTool === 'PcTl';
  }

  /**
   * Actions of the radial menu around the navigation puck, by clock position: tools along the top, undo and redo at
   * the sides, the color picker and the three most recently used brush presets along the bottom.
   */
  function radialItems(): RadialItem[] {
    const toolItem = (id: PaintTool, label: string, icon: RadialItem['icon'], slot: number): RadialItem => ({
      id,
      label,
      icon,
      slot,
      active: tool() === id,
      run: () => chooseTool(id)
    });
    const presets = recentPresets.recent(3).map((id, index): RadialItem => {
      const name = library.find(id)?.name ?? '';
      return {
        id: `preset:${id}`,
        label: `Brush preset: ${name}`,
        text: initials(name),
        // The most recent preset sits at the bottom, the next ones beside it.
        slot: [6, 5, 7][index]!,
        disabled: !canChangeBrush(),
        run: () => usePreset(id)
      };
    });

    return [
      toolItem('brush', 'Brush', 'draw', 0),
      toolItem('eraser', 'Eraser', 'erase', 1),
      toolItem('fill', 'Fill', 'fill', 2),
      toolItem('gradient', 'Gradient', 'gradient', 4),
      {
        id: 'redo',
        label: 'Redo',
        icon: 'redo',
        slot: 3,
        disabled: !engine.state().canRedo || !ready(),
        run: () => edit({ type: 'redo' })
      },
      ...presets,
      { id: 'picker', label: 'Pick color from canvas', icon: 'picker', slot: 8, run: colorPicker.arm },
      {
        id: 'undo',
        label: 'Undo',
        icon: 'undo',
        slot: 9,
        disabled: !engine.state().canUndo || !ready(),
        run: () => edit({ type: 'undo' })
      },
      {
        id: 'transform',
        label: transform.active() ? 'Apply transform' : 'Transform',
        icon: 'move',
        slot: 10,
        active: transform.active(),
        run: toggleTransform
      },
      toolItem('lasso', 'Lasso', 'lasso', 11)
    ];
  }

  /** Paints with preset `id`: the eraser keeps erasing with it, other tools switch to the brush. */
  function usePreset(id: string) {
    const slot = tool() === 'eraser' ? 'eraser' : 'brush';
    if (tool() !== slot) {
      chooseTool(slot);
    }

    void choosePreset(id, slot);
  }

  /** The view's bounds in document pixels, for tools that cover the view, such as the fill and the gradient. */
  function visibleArea() {
    const view = size();
    const current = camera.current();
    const corners = [
      { x: 0, y: 0 },
      { x: view.width, y: 0 },
      { x: 0, y: view.height },
      { x: view.width, y: view.height }
    ].map((corner) => screenToWorld(corner, current, view));
    const xs = corners.map(({ x }) => x),
      ys = corners.map(({ y }) => y);
    const left = Math.min(...xs),
      top = Math.min(...ys);
    return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
  }

  /** The current tool paints symmetric copies. */
  function supportsSymmetry() {
    return supportsPaintSymmetry(brush()) && paintsWithBrush();
  }

  /** The active tool paints with a brush: the brush or the eraser. */
  function paintsWithBrush() {
    return tool() === 'brush' || tool() === 'eraser';
  }
}

/** Up to three letters naming a preset in the radial menu: the initials of its words, or the start of one word. */
function initials(name: string) {
  const words = name.split(/[\s_-]+/).filter(Boolean);
  return (words.length > 1 ? words.map((word) => word[0]).join('') : (words[0] ?? '')).slice(0, 3).toUpperCase();
}

/** Commands that pass while a transform is in progress: view, settings and the transform's own edits. */
const allowedWhileTransforming = new Set<Parameters<ReturnType<typeof guardEdits>>[0]['type']>([
  'view',
  'selection-view',
  'debug',
  'live-tail',
  'adaptive-quality',
  'diagnostics',
  'download',
  'png',
  'cancel'
]);

/** Save indicator text for each engine save state. */
const saveStatus = {
  saved: { label: 'Saved', title: 'Saved on this device' },
  saving: { label: 'Saving…', title: 'Writing completed changes to this device' },
  unsaved: { label: 'Unsaved changes', title: 'Changes are saved automatically after the stroke finishes' }
} as const;
