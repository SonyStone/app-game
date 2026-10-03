import { blockEraserSize, isBlockEraser } from '@app-game/abr-brush/blockEraser';
import { record } from '@app-game/abr-brush/form';
import { NavigationPuck } from '@app-game/navigation-puck';
import { screenToWorld, worldToScreen, type Point } from '@app-game/paint-core/camera';
import { supportsPaintSymmetry } from '@app-game/paint-core/symmetry';
import type { JSX } from '@solidjs/web';
import { createSignal, Match, Show, Switch } from 'solid-js';
import type { PaintError } from '../../shared/errors';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import { AbrViewerDialog, createAbrPresets } from '../abr';
import {
  BrushAdjustHud,
  BrushPanel,
  createBrushAdjust,
  createBrushTools,
  createMixerBrush,
  MixerActions,
  type PaintTool
} from '../brush';
import { createPaintCamera, createViewSize } from '../camera';
import { BrushCursor, CanvasDebug, firstCanvasAction, PaintCanvas, type CanvasInput } from '../canvas';
import { ColorPanel, createCanvasColorPicker } from '../color';
import { createDeveloperSettings, DeveloperDialog } from '../developer';
import { createPaintEngine } from '../engine';
import { createImagePlacement, HistorySourceControl, LayersPanel } from '../layers';
import { createPerformanceMonitor, PerformancePanel } from '../performance';
import { createSelection, createSelectionView, guardEdits, SelectionActions } from '../selection';
import { createSymmetry, SymmetryGuide, SymmetryPanel } from '../symmetry';
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
  const tools = createBrushTools();
  const engine = createPaintEngine({
    settings: developer,
    onError: setError,
    onSelection: (event) => selection.receive(event),
    prepare: () => presets.restore(),
    frames: { enabled: developer.performanceMonitor, receive: (event) => monitor.record(event) }
  });
  const selection = createSelection({ send: engine.send, document: engine.state, ready: engine.canEdit });
  createSelectionView({ points: selection.points, ready: engine.canEdit, send: engine.send });
  /** Sends document commands, respecting a pending selection edit and clearing the outline where needed. */
  const edit = guardEdits(selection, engine.send);
  const size = createViewSize(stage);
  const monitor = createPerformanceMonitor({ enabled: developer.performanceMonitor, label: engine.mode, size });
  const camera = createPaintCamera({
    restored: () => engine.restored()?.camera,
    size,
    ready: engine.canEdit,
    send: engine.send,
    bounds: () => canvas()?.getBoundingClientRect()
  });
  const symmetry = createSymmetry({
    restored: () => engine.restored()?.symmetry,
    canUpdate: canUpdateSymmetry,
    send: engine.send
  });
  const mixer = createMixerBrush({
    brush: tools.brush,
    tool: tools.tool,
    run: engine.runBrushCommand,
    canRun: () => canChangeBrush() && !presets.isBusy(),
    onError: setError
  });
  const presets = createAbrPresets({
    upload: engine.putResources,
    canChange: canChangeBrush,
    select: tools.selectPreset
  });
  const brushAdjust = createBrushAdjust({
    brush: tools.brush,
    update: tools.updateBrush,
    available: () => tools.tool() !== 'lasso' && canChangeBrush()
  });
  const colorPicker = createCanvasColorPicker({
    paints: () => paintsColor(),
    toScreen: (point) => worldToScreen(point, camera.current(), size()),
    pick: engine.pickColor,
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
  const fullscreen = createFullscreenToggle(editor, setError);

  const { brush, tool } = tools;
  const { ready } = engine;
  const [panel, setPanel] = createSignal<PanelId>();
  const [abrOpen, setAbrOpen] = createSignal(false);
  const [abrMounted, setAbrMounted] = createSignal(false);
  const [developerOpen, setDeveloperOpen] = createSignal(false);
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
    ready: () =>
      engine.canEdit() && !selection.isBusy() && !presets.isBusy() && (tool() !== 'abr-brush' || !!brush().engine),
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
    canvasAction: firstCanvasAction(mixer.canvasAction, colorPicker.canvasAction),
    adjust: brushAdjust.adjust,
    puck: camera.navigation,
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
    cancel() {
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

  /** Switches tools; choosing the active tool again keeps the lasso outline. */
  function chooseTool(next: PaintTool) {
    if (selection.isBusy() || next === tools.tool()) {
      return;
    }

    mixer.cancelPick();
    colorPicker.cancel();
    selection.clear();
    tools.chooseTool(next);
  }

  /**
   * Switches the execution mode unless a selection edit, preset upload or brush command must finish first. An engine
   * that is not ready cannot checkpoint, so it is restarted in the other mode from the saved document instead.
   */
  function setWorkerEnabled(enabled: boolean) {
    if (selection.isBusy() || presets.isBusy() || engine.isCommandBusy()) {
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

  /** The ABR brush edits its preset in the ABR viewer; other tools use the brush panel. */
  function openBrushSettings(target: HTMLElement) {
    if (tool() !== 'abr-brush') {
      togglePanel('brush', target);
      return;
    }

    launcher = target;
    setPanel(undefined);
    camera.navigation.close();
    setAbrMounted(true);
    setAbrOpen(true);
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
              crosshair={tool() === 'lasso'}
              ref={setCanvas}
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
        <Show when={ready() && (engine.state().tileCount === 0 || needsPreset())}>
          <div class={styles.welcome}>
            <p>{needsPreset() ? 'Choose an ABR brush in Brush settings.' : 'Pen to draw. Touch to move.'}</p>
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
        <Show when={ready() && tool() !== 'lasso' && cursor()}>
          {(point) => <BrushCursor point={point()} size={cursorSize()} square={blockCursor()} />}
        </Show>
        <Show when={camera.navigation.center()}>
          <NavigationPuck navigation={camera.navigation} focusTarget={() => canvas()!} />
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
          onChooseTool={chooseTool}
          onToggleMirror={camera.toggleMirror}
          onTogglePanel={togglePanel}
        />
        <Show when={tool() === 'lasso'}>
          <SelectionActions
            disabled={!ready() || selection.drawing()}
            busy={selection.busy()}
            selected={selection.points().length >= 3}
            hasClipboard={selection.hasClipboard()}
            onAction={selection.action}
            onDeselect={selection.clear}
          />
        </Show>
        <div class={styles.doublePuck} aria-label="Brush and color">
          <button
            aria-label="Brush settings"
            title="Brush settings"
            aria-expanded={panel() === 'brush' || abrOpen() ? 'true' : 'false'}
            aria-controls="paint-panel"
            onClick={(event) => openBrushSettings(event.currentTarget)}
          >
            <SketchIcon
              name={tool() === 'abr-brush' ? 'brush' : brush().tool === 'eraser' ? 'erase' : 'draw'}
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
          aria-label="Navigation puck"
          title="Navigation · hold Space / V / Right click"
          onClick={() => {
            setPanel(undefined);
            camera.navigation.open();
          }}
        >
          <SketchIcon name="pan" />
        </button>
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
                  <BrushPanel brush={brush()} onChange={tools.updateBrush} />
                </Match>
                <Match when={id === 'color'}>
                  <ColorPanel
                    brush={brush()}
                    onChange={tools.updateBrush}
                    onPickCanvas={() => {
                      colorPicker.arm();
                      closePanel();
                    }}
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
                  <LayersPanel
                    state={engine.state()}
                    ready={ready()}
                    onAction={(action) => edit({ type: 'layer', action })}
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
   * The active tool paints color, so Alt/Option-click picks a color: the round brush and ABR Brush or Pencil presets.
   * ABR erasers keep Alt for erasing to history, and the Mixer Brush for loading paint.
   */
  function paintsColor() {
    if (tool() === 'brush') {
      return true;
    }

    const abrTool = record(record(record(brush().engine?.settings).values).tool).type;
    return tool() === 'abr-brush' && brush().engine?.id === 'abr' && (abrTool === 'PbTl' || abrTool === 'PcTl');
  }

  /** The ABR brush is chosen but no preset has been applied yet. */
  function needsPreset() {
    return tool() === 'abr-brush' && !brush().engine;
  }

  /** The current tool paints symmetric copies. */
  function supportsSymmetry() {
    return supportsPaintSymmetry(brush()) && tool() !== 'lasso';
  }
}

/** Save indicator text for each engine save state. */
const saveStatus = {
  saved: { label: 'Saved', title: 'Saved on this device' },
  saving: { label: 'Saving…', title: 'Writing completed changes to this device' },
  unsaved: { label: 'Unsaved changes', title: 'Changes are saved automatically after the stroke finishes' }
} as const;
