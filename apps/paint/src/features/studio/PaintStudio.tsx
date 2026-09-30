import { blockEraserSize, isBlockEraser } from '@app-game/abr-brush/blockEraser';
import { record } from '@app-game/abr-brush/form';
import { NavigationPuck } from '@app-game/navigation-puck';
import type { Point } from '@app-game/paint-core/camera';
import { supportsPaintSymmetry } from '@app-game/paint-core/symmetry';
import type { JSX } from '@solidjs/web';
import { createSignal, For, Match, Show, Switch } from 'solid-js';
import { isRestorable, type PaintError } from '../../shared/errors';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import { AbrViewerDialog, createAbrPresets } from '../abr';
import { BrushPanel, ColorPanel, createBrushTools, createMixerBrush, MixerActions, type PaintTool } from '../brush';
import { createPaintCamera, createViewSize } from '../camera';
import { BrushCursor, CanvasDebug, PaintCanvas, type CanvasInput } from '../canvas';
import { createDeveloperSettings, DeveloperDialog } from '../developer';
import { createPaintEngine } from '../engine';
import { HistorySourceControl, LayersPanel } from '../layers';
import { createSelection, guardEdits, SelectionActions, syncSelectionView } from '../selection';
import { createSymmetry, SymmetryGuide, SymmetryPanel } from '../symmetry';
import { createFullscreenToggle } from './createFullscreenToggle';
import { createPaintShortcuts } from './createPaintShortcuts';
import { DrawingMenu } from './DrawingMenu';
import styles from './PaintStudio.module.css';
import { StudioPanel } from './StudioPanel';

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
    prepare: () => presets.restore()
  });
  const selection = createSelection({ send: engine.send, document: engine.state, ready: engine.canEdit });
  syncSelectionView({ points: selection.points, ready: engine.canEdit, send: engine.send });
  /** Sends document commands, respecting a pending selection edit and clearing the outline where needed. */
  const edit = guardEdits(selection, engine.send);
  const size = createViewSize(stage);
  const camera = createPaintCamera({
    restored: () => engine.restored()?.camera,
    size,
    ready: engine.canEdit,
    send: engine.send,
    bounds: () => canvas()?.getBoundingClientRect()
  });
  const symmetry = createSymmetry({
    restored: () => engine.restored()?.symmetry,
    canUpdate: () => engine.canEdit() && !selection.busy(),
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
    upload: engine.putResource,
    canChange: canChangeBrush,
    select: tools.selectPreset
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
    canvasAction: mixer.canvasAction,
    puck: camera.navigation,
    selection: { ...selection, enabled: () => tool() === 'lasso' }
  };

  createPaintShortcuts({
    closePanel() {
      if (panel()) {
        closePanel();
      }
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
    cancel() {
      mixer.cancelPick();
      camera.navigation.close();
      selection.clear();
      edit({ type: 'cancel' });
    }
  });

  /** Brush settings may change: no stroke, selection edit, brush command or preset upload is running. */
  function canChangeBrush() {
    return engine.canEdit() && !selection.isBusy() && !engine.isDrawing() && !engine.isCommandBusy();
  }

  function chooseTool(next: PaintTool) {
    if (selection.isBusy()) {
      return;
    }

    mixer.cancelPick();
    selection.clear();
    tools.chooseTool(next);
  }

  /** Switches the execution mode unless a selection edit, preset upload or brush command must finish first. */
  function setWorkerEnabled(enabled: boolean) {
    if (selection.isBusy() || presets.isBusy() || engine.isCommandBusy()) {
      return;
    }

    if (engine.switchMode(enabled ? 'worker' : 'main')) {
      mixer.cancelPick();
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
      <main ref={setStage} class={styles.stage} aria-label="Drawing workspace" data-picking={mixer.picking()}>
        <Show when={engine.mode()} keyed>
          {(mode) => (
            <PaintCanvas
              connect={(element) => engine.connect(element, mode)}
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
        <Show when={ready() && (engine.state().tileCount === 0 || needsPreset())}>
          <div class={styles.welcome}>
            <p>{needsPreset() ? 'Choose an ABR brush in Brush settings.' : 'Pen to draw. Touch to move.'}</p>
          </div>
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
            return presets.useBrush(asset);
          }}
        />
      </Show>
      <div class={styles.ui}>
        <span class={styles.saveState} role="status" title={saveStatus[engine.saveState()].title}>
          {ready() ? saveStatus[engine.saveState()].label : 'Preparing drawing…'}
        </span>
        <div class={styles.viewControls} aria-label="Canvas view">
          <button {...fullscreen.props}>
            <SketchIcon name={fullscreen.isActive() ? 'fullscreenExit' : 'fullscreen'} size={16} />
          </button>
          <button aria-label="Zoom out" onClick={() => camera.zoomBy(0.8)}>
            <SketchIcon name="minus" size={16} />
          </button>
          <button aria-label="Reset zoom" title="Reset zoom to 100%" onClick={() => camera.resetZoom()}>
            {Math.round(camera.camera().zoom * 100)}%
          </button>
          <button aria-label="Zoom in" onClick={() => camera.zoomBy(1.25)}>
            <SketchIcon name="plus" size={16} />
          </button>
          <Show when={Math.abs(camera.camera().angle) > 0.005}>
            <button aria-label="Reset rotation" title="Reset rotation" onClick={() => camera.resetRotation()}>
              {Math.round((camera.camera().angle * 180) / Math.PI)}°
            </button>
          </Show>
        </div>
        <nav class={styles.tools} aria-label="Drawing tools">
          <For each={toolButtons}>
            {(button) => (
              <button
                aria-label={button.label}
                title={button.title}
                aria-pressed={tool() === button.tool ? 'true' : 'false'}
                onClick={() => chooseTool(button.tool)}
              >
                <SketchIcon name={button.icon} />
              </button>
            )}
          </For>
          <span class={styles.toolSeparator} />
          <button
            aria-label="Mirror canvas"
            title="Mirror view"
            aria-pressed={camera.camera().mirrored ? 'true' : 'false'}
            onClick={() => camera.toggleMirror()}
          >
            <SketchIcon name="mirror" />
          </button>
          <button
            aria-label="Paint symmetry"
            title="Paint symmetry"
            aria-pressed={symmetry.symmetry().mode !== 'off' ? 'true' : 'false'}
            aria-expanded={panel() === 'symmetry' ? 'true' : 'false'}
            onClick={(event) => togglePanel('symmetry', event.currentTarget)}
          >
            <SketchIcon name="symmetry" />
          </button>
          <button
            aria-label="Layers"
            title="Layers"
            aria-expanded={panel() === 'layers' ? 'true' : 'false'}
            aria-controls="paint-panel"
            onClick={(event) => togglePanel('layers', event.currentTarget)}
          >
            <SketchIcon name="layers" />
          </button>
        </nav>
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
                    disabled={!symmetry.canUpdate()}
                    inactive={!supportsSymmetry()}
                    viewCenter={camera.camera()}
                    onChange={symmetry.update}
                  />
                </Match>
                <Match when={id === 'brush'}>
                  <BrushPanel brush={brush()} onChange={tools.updateBrush} />
                </Match>
                <Match when={id === 'color'}>
                  <ColorPanel brush={brush()} onChange={tools.updateBrush} />
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
            onDismiss={() => setError(undefined)}
          />
        )}
      </Show>
    </div>
  );

  /** The ABR brush is chosen but no preset has been applied yet. */
  function needsPreset() {
    return tool() === 'abr-brush' && !brush().engine;
  }

  /** The current tool paints symmetric copies. */
  function supportsSymmetry() {
    return supportsPaintSymmetry(brush()) && tool() !== 'lasso';
  }
}

/** Side panels, by id, with their titles. */
const panelTitles = {
  symmetry: 'Paint symmetry',
  file: 'Drawing',
  brush: 'Brush',
  color: 'Color',
  layers: 'Layers'
} as const;

type PanelId = keyof typeof panelTitles;

/** Tool buttons in toolbar order. */
const toolButtons = [
  { tool: 'brush', label: 'Brush', title: 'Brush · B', icon: 'draw' },
  { tool: 'abr-brush', label: 'ABR Brush', title: 'ABR Brush · experimental', icon: 'brush' },
  { tool: 'eraser', label: 'Eraser', title: 'Eraser · E', icon: 'erase' },
  { tool: 'lasso', label: 'Lasso', title: 'Lasso · L', icon: 'lasso' }
] as const satisfies readonly { tool: PaintTool; label: string; title: string; icon: string }[];

/** Save indicator text for each engine save state. */
const saveStatus = {
  saved: { label: 'Saved', title: 'Saved on this device' },
  saving: { label: 'Saving…', title: 'Writing completed changes to this device' },
  unsaved: { label: 'Unsaved changes', title: 'Changes are saved automatically after the stroke finishes' }
} as const;

/**
 * Alert for the latest failure. A paused renderer offers "Restore renderer"; a busy editor asks to retry later;
 * other failures only need dismissing.
 */
function ErrorNotice(props: { error: PaintError; onRestore: () => void; onDismiss: () => void }) {
  const title = () => {
    if (isRestorable(props.error)) {
      return 'Canvas paused';
    }

    return props.error.kind === 'engine' && props.error.code === 'busy'
      ? 'Paint is busy'
      : 'Could not complete that action';
  };

  return (
    <div class={styles.error} role="alert">
      <strong>{title()}</strong>
      <p>{props.error.message}</p>
      <Show when={isRestorable(props.error)}>
        <button onClick={() => props.onRestore()}>Restore renderer</button>
      </Show>
      <button onClick={() => props.onDismiss()}>Dismiss</button>
    </div>
  );
}
