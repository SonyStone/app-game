import { blockEraserSize, isBlockEraser } from '@app-game/abr-brush/blockEraser';
import { record } from '@app-game/abr-brush/form';
import { screenToWorld, worldToScreen, type Point } from '@app-game/paint-core/camera';
import { supportsPaintSymmetry } from '@app-game/paint-core/symmetry';
import { errorMessage } from '@app-game/solid-gpu/errors';
import { createEventListener } from '@solid-primitives/event-listener';
import { createEffect, createSignal, flush } from 'solid-js';
import { engineError, type PaintError } from '../../shared/errors';
import { createContextMenuBlock } from '../../shared/ui/createContextMenuBlock';
import { createPageGestureGuard } from '../../shared/ui/createPageGestureGuard';
import { createPointerTypeAttribute } from '../../shared/ui/createPointerTypeAttribute';
import { clearAbrBrush, createAbrPresets } from '../abr';
import { clearRoundBrush, createBrushAdjust, createBrushTools, createMixerBrush, type PaintTool } from '../brush';
import { createBrushLibrary, createBrushStorage, createPresetUploads, createRecentPresets } from '../brush-library';
import { createPaintCamera, createViewSize } from '../camera';
import { firstCanvasAction, type CanvasInput } from '../canvas';
import { createCanvasColorPicker } from '../color';
import { createColorWheelSettings } from '../color-wheel';
import { createRecentColors } from '../color/createRecentColors';
import { createCoolorusSettings } from '../coolorus-wheel/createCoolorusSettings';
import { createDeveloperSettings } from '../developer';
import { createDrawingFolder } from '../drawing-folder';
import { createPaintEngine } from '../engine';
import { createFill } from '../fill';
import { createFrames, frameRegion } from '../frames';
import { arrivalStorageWaitMs, arrivedByMove, createFreshTab } from '../fresh-tab';
import { createGpuWarmup } from '../gpu-warmup';
import { createGradient } from '../gradient';
import { createHiddenLayerGuard } from '../hidden-layer';
import { createInkTrail } from '../ink-trail';
import { createLayerThumbnails } from '../layer-thumbnails';
import { createImagePlacement, createLayerFilter } from '../layers';
import { createLiveBroadcast, liveRelayUrl } from '../live';
import { createLocalUndo } from '../local-undo';
import { createNativeShell, saveFile } from '../native-shell';
import { createPalmRejection, createPalmRejectionSettings } from '../palm-rejection';
import { createPenHover } from '../pen-hover';
import { createPerformanceMonitor } from '../performance';
import { createPressureCalibration } from '../pressure-calibration';
import { createQuickShape } from '../quickshape';
import { radialLayout } from '../radial-menu';
import { createInputRecorder } from '../recording';
import { createSelection, createSelectionView, guardEdits } from '../selection';
import { createSymmetry } from '../symmetry';
import { createTransform } from '../transform';
import { createViewOptions } from '../view-options';
import { createAutoRestore } from './createAutoRestore';
import { createFullscreenToggle } from './createFullscreenToggle';
import { createPaintShortcuts } from './createPaintShortcuts';
import { createSessionWindows } from './createSessionWindows';

/**
 * One open drawing without any layout: the engine, camera, brushes, tools, selection, layers, frames and the other
 * feature controllers, wired to each other, plus the commands that span several of them. Every Paint variant creates
 * one session and arranges its own UI around it, so variants differ only in presentation and all open the same
 * saved drawing.
 *
 * The session also takes over page behavior every variant needs: the context menu and browser page gestures are
 * blocked, the editor element gets the pointer type attribute, a paused renderer restores itself, palms beside the pen
 * are ignored, and once Chrome stops reporting pen hover the drawing moves to a new tab (see `SessionNotices`). In the
 * Android shell app the shell supplies pen hover instead, so no move is offered, and its back button closes the
 * variant's open panel (see `createNativeShell`). Must be created within a Solid owner; disposing the owner stops the
 * engine.
 */
export function createPaintSession(
  options: {
    /** The variant's open panel, recorded with input recordings; omitted when the variant has none. */
    panel?: () => string | undefined;
    /**
     * The saved drawing to open, `paint-studio` by default: the one every variant shares. A feature demo passes a
     * name of its own, so trying it never touches the user's drawing.
     */
    storageName?: string;
  } = {}
) {
  const [editor, setEditor] = createSignal<HTMLElement>();
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
  const layerThumbnails = createLayerThumbnails();
  const engine = createPaintEngine({
    settings: developer,
    onError: setError,
    onSelection: (event) => selection.receive(event),
    prepare: () => uploads.restore(),
    frames: { enabled: developer.performanceMonitor, receive: (event) => monitor.record(event) },
    layerThumbnails: { size: layerThumbnails.size, receive: layerThumbnails.receive },
    storageName: options.storageName,
    storageWaitMs: arrivalStorageWaitMs(),
    save: (blob, name) =>
      void saveFile(blob, name).catch((cause: unknown) =>
        setError(engineError('failed', `${name} could not be saved: ${errorMessage(cause)}`, cause))
      )
  });
  const selection = createSelection({
    send: engine.send,
    run: engine.runEdit,
    document: engine.state,
    ready: engine.canEdit,
    area: visibleArea,
    // A press this close to a polygon's first corner on screen closes it.
    closeDistance: () => 10 / camera.camera().zoom,
    onError: setError
  });
  // An open polygon's next edge follows the hovering pointer.
  createEffect(
    () => (selection.tool() === 'polygon' && selection.drawing() ? cursor() : undefined),
    (point) => {
      if (point) {
        selection.hover(screenToWorld(point, camera.current(), size()));
      }
    }
  );
  createSelectionView({
    preview: selection.preview,
    hidden: () => transform.active(),
    ready: engine.canEdit,
    send: engine.send
  });
  /** Sends document commands, respecting a pending selection edit and clearing the outline where needed. */
  const guarded = guardEdits(selection, engine.send);
  /**
   * Sends document commands. Undo during a local undo session cancels the session instead. While transforming, Undo
   * cancels the transform and other document changes wait for it to be applied or cancelled, so the transform stays
   * one undo step.
   */
  const edit: typeof guarded = (command) => {
    recorder.command(command);
    if (localUndo.open() && command.type === 'undo') {
      void localUndo.cancel();
      return;
    }

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
    // A stroke in progress also moves the cursor; Alt pressed during it does not preview.
    hovered: () => (engine.isDrawing() ? undefined : cursor()),
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
    canFill: () => engine.canEdit() && !selection.isBusy() && !engine.isDrawing(),
    send: edit
  });
  const gradient = createGradient({
    active: () => tools.tool() === 'gradient',
    colors: () => ({ foreground: tools.brush().color, background: tools.brush().backgroundColor ?? '#ffffff' }),
    area: visibleArea,
    selected: selection.selected,
    canDraw: () => engine.canEdit() && !selection.isBusy() && !engine.isDrawing(),
    send: edit
  });
  const hiddenLayer = createHiddenLayerGuard({
    paints: () => tools.tool() === 'brush' || tools.tool() === 'eraser',
    layer: () => engine.state().layers.find((layer) => layer.id === engine.state().activeId)
  });
  const transform = createTransform({
    run: engine.runEdit,
    canStart: () => engine.canEdit() && !selection.isBusy() && !engine.isDrawing(),
    onError: setError
  });
  const localUndo = createLocalUndo({
    active: () => tools.tool() === 'local-undo',
    run: engine.runEdit,
    canStart: () => engine.canEdit() && !selection.isBusy() && !engine.isDrawing(),
    revision: () => engine.state().revision,
    onError: setError
  });
  createEffect(
    () => (tools.tool() === 'fill' || tools.tool() === 'gradient') && !selection.selected() && !transform.active(),
    (unselected) => {
      if (unselected) {
        tools.chooseTool('lasso');
      }
    }
  );
  const fullscreen = createFullscreenToggle(editor, setError);
  createAutoRestore({ error, restore: restoreRenderer });
  createPointerTypeAttribute(editor);
  createContextMenuBlock();
  createPageGestureGuard();
  const colorWheel = createColorWheelSettings();
  const recentColors = createRecentColors();
  const coolorus = createCoolorusSettings();
  const windows = createSessionWindows();
  const pressureCalibration = createPressureCalibration();
  const viewOptions = createViewOptions({ ready: engine.canEdit, send: engine.send });
  const drawingFolder = createDrawingFolder({
    status: () => engine.paging().storage?.folder,
    send: edit,
    onError: setError
  });
  const frames = createFrames({
    restored: () => engine.restored()?.features,
    canUpdate: canUpdateSymmetry,
    send: engine.send,
    navigate: camera.navigate,
    camera: camera.camera,
    size,
    selection: () => boundsCorners(selection.summary().bounds) ?? []
  });
  const layerFilter = createLayerFilter({
    layers: () => engine.state().layers,
    activeId: () => engine.state().activeId,
    // In a frame, the layers with paint in it; otherwise those in view.
    inView: () => (frames.activeFrame() ? (engine.layersInRegions()[frameRegion] ?? []) : engine.layersInView()),
    camera: camera.camera
  });
  const recentPresets = createRecentPresets({ current: tools.preset, exists: (id) => library.find(id) !== undefined });
  const live = createLiveBroadcast({
    url: liveRelayUrl(location, import.meta.env.DEV),
    list: engine.liveList,
    read: engine.liveRead,
    revision: () => engine.state().revision,
    camera: camera.camera,
    size,
    pointer: () => {
      const point = cursor();
      return point && { point: screenToWorld(point, camera.current(), size()), contact: engine.isDrawing() };
    },
    brushSize: () => tools.brush().size,
    ready: engine.canEdit
  });
  const recorder = createInputRecorder({
    exportFile: engine.exportFile,
    observe: () => ({
      ready: ready(),
      tool: tool(),
      brush: { preset: tools.preset(), size: brush().size, opacity: brush().opacity, color: brush().color },
      panel: options.panel?.(),
      camera: camera.camera(),
      transforming: transform.active(),
      selection: { selected: selection.selected(), busy: selection.busy(), drawing: selection.drawing() },
      document: {
        layers: engine.state().layers.length,
        activeId: engine.state().activeId,
        canUndo: engine.state().canUndo,
        canRedo: engine.state().canRedo
      },
      error: error()?.message,
      palmRejection: palmSettings.settings(),
      penHovers: penHover.hovers() ?? null
    })
  });
  const palmSettings = createPalmRejectionSettings();
  // After the recorder, so that recordings keep ignored touches, and before the other window listeners, so that
  // nothing else sees them.
  // Before palm rejection, so that the press that finds the pen without hover is guarded as such.
  const penHover = createPenHover({ trustRemembered: !arrivedByMove() });
  const nativeShell = createNativeShell();
  const palmOptions = palmSettings.settings;
  const hoverless = () => {
    const mode = palmOptions().hoverless;
    return mode === 'on' || (mode === 'auto' && penHover.hovers() === false);
  };
  const palm = createPalmRejection({
    enabled: () => palmOptions().enabled,
    hand: () => palmOptions().hand,
    tolerance: () => palmOptions().tolerance,
    linger: () => (hoverless() ? palmOptions().liftLinger : palmOptions().linger),
    before: () => (hoverless() ? palmOptions().before : 0),
    // A palm taken back puts the view back where it was when the earliest of them landed.
    onRetract: (pointerIds) => {
      const cameras = pointerIds.flatMap((id) => touchCameras.get(id) ?? []);
      if (cameras[0]) {
        camera.navigate(cameras[0]);
      }
    }
  });
  const freshTab = createFreshTab({
    // The shell replays the pen hover the WebView loses, and a new tab means nothing there.
    lostContacts: () => (nativeShell.active ? 0 : penHover.lostContacts()),
    // A transform or local undo in progress lives in this engine only.
    idle: () =>
      engine.canEdit() && !engine.isDrawing() && !transform.active() && !localUndo.open() && !selection.drawing(),
    moveOut: engine.moveOut
  });
  const inkTrail = createInkTrail({ canvas, enabled: developer.inkTrail, zoom: () => camera.current().zoom });
  const quickShape = createQuickShape({ send: edit, camera: camera.current });
  const warmup = createGpuWarmup({
    enabled: () => developer.warmGpu() && engine.canEdit(),
    send: engine.send
  });
  /** The view when each touch still down landed, in landing order, for `onRetract`. */
  const touchCameras = new Map<number, ReturnType<typeof camera.current>>();
  createEventListener(
    window,
    'pointerdown',
    (event) => {
      if (event.pointerType === 'touch') {
        touchCameras.set(event.pointerId, camera.current());
      }
    },
    { capture: true, passive: true }
  );
  createEventListener(window, ['pointerup', 'pointercancel'], (event) => touchCameras.delete(event.pointerId), {
    capture: true,
    passive: true
  });

  const { brush, tool } = tools;
  const { ready } = engine;

  return {
    /** Binds the element that holds the whole variant: fullscreen and the pointer type attribute apply to it. */
    setEditor,
    /** Binds the drawing workspace, whose size is the view size; see `PaintStage`. */
    setStage,
    stage,
    /** Binds the drawing canvas; see `PaintStage`. */
    setCanvas,
    canvas,
    /** The latest failure to show, until dismissed or restored; see `SessionNotices`. */
    error,
    setError,
    /** The hovering or drawing pointer in canvas CSS pixels, while over the canvas. */
    cursor,
    setCursor,
    developer,
    library,
    tools,
    brush,
    tool,
    engine,
    ready,
    selection,
    edit,
    size,
    monitor,
    camera,
    symmetry,
    mixer,
    uploads,
    presets,
    brushAdjust,
    colorPicker,
    images,
    fill,
    gradient,
    hiddenLayer,
    transform,
    /** The local undo tool's settings and session; see `createLocalUndo`. */
    localUndo,
    fullscreen,
    colorWheel,
    /** Recent colors shared by every picker and mixing palette in this session. */
    recentColors,
    /** Persisted Coolorus preferences shared by all picker instances. */
    coolorus,
    viewOptions,
    drawingFolder,
    frames,
    layerFilter,
    /** Images of each layer's pixels for layer panels, made only while one wants them; see `createLayerThumbnails`. */
    layerThumbnails,
    recentPresets,
    live,
    recorder,
    /** Palm rejection settings, remembered in `localStorage`; see `PalmRejectionControls`. */
    palmSettings,
    /** Whether the browser reports the pen hovering; drives palm rejection without hover and `freshTab`. */
    penHover,
    /** Touches on the pen hand's side of the pen being ignored; see `PalmRejectionDebug`. */
    palm,
    /** Moving the drawing to a new tab once Chrome loses the pen hover; see `SessionNotices`. */
    freshTab,
    /** Paint inside the Android shell app: forwarded pen hover, back handling and native calls. */
    nativeShell,
    /**
     * The floating windows every variant can open: the mixing palette, the pen settings and the pen pressure
     * calibration; see `SessionWindows`.
     */
    windows,
    /**
     * This device's pen pressure curve, remembered in `localStorage`: `canvasInput` maps every pen sample through it
     * and widens a brush's default pressure range (`strokeBrush`), so it acts on the strokes of every variant.
     */
    pressureCalibration,
    /** Held strokes becoming shapes, with their settings; see `QuickShapeSettings` and the hint in `StageOverlays`. */
    quickShape,
    canvasInput,
    createShortcuts,
    chooseTool,
    chooseLocalUndo,
    toggleTransform,
    choosePreset,
    usePreset,
    rememberTools,
    loadColor,
    setColor,
    toggleTool,
    setWorkerEnabled,
    restoreRenderer,
    undo: () => edit({ type: 'undo' }),
    redo: () => edit({ type: 'redo' }),
    canUpdateSymmetry,
    canChangeBrush,
    selectionTool,
    paintsColor,
    paintsWithBrush,
    supportsSymmetry,
    masksWithBrush,
    blockCursor,
    cursorSize,
    visibleArea,
    boundsCorners
  };

  /**
   * The canvas input of this session for `PaintCanvas`, with the pen latency switches of Developer and the device's
   * pressure calibration applied. Two- and three-finger taps undo and redo unless `extra` replaces the touch gestures;
   * `extra.puckPicker` adds controls chosen around the navigation puck.
   */
  function canvasInput(extra: Pick<CanvasInput, 'touchGestures' | 'puckPicker'> = {}): CanvasInput {
    return {
      camera: camera.current,
      size,
      brush: () => pressureCalibration.strokeBrush(brush()),
      eraser: () => pressureCalibration.strokeBrush(tools.eraser()),
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
      mapPressure: pressureCalibration.mapPressure,
      predict: developer.predictStrokes,
      hover: warmup.hover,
      drawn: inkTrail.drawn,
      withheld: inkTrail.withheld,
      // The Mixer Brush loads paint with Alt/Option; other painting tools pick a color.
      canvasAction: firstCanvasAction(
        // Alt/Option picks colors even while transforming; the transform then consumes other contacts.
        colorPicker.canvasAction,
        transform.canvasAction,
        hiddenLayer.canvasAction,
        mixer.canvasAction,
        localUndo.canvasAction,
        fill.canvasAction,
        gradient.canvasAction
      ),
      adjust: brushAdjust.adjust,
      strokeHold: quickShape.strokeHold,
      touchGestures: extra.touchGestures ?? {
        tap(fingers) {
          if (fingers === 2 && engine.state().canUndo) {
            edit({ type: 'undo' });
          }

          if (fingers === 3 && engine.state().canRedo) {
            edit({ type: 'redo' });
          }
        }
      },
      puck: camera.navigation,
      puckPicker: extra.puckPicker,
      // Overlays such as the transform box sit over the canvas; the puck opens over them too.
      puckSurface: stage,
      selection: { ...selection, enabled: () => tool() === 'lasso' }
    };
  }

  /**
   * The editor's keyboard shortcuts for this session; see `createPaintShortcuts`. `closePanel` closes the variant's
   * open panel or popover and returns whether one was open, so Escape closes it before cancelling work; the Android
   * shell's back button closes it too.
   */
  function createShortcuts(variant: { closePanel: () => boolean }) {
    nativeShell.onBack(variant.closePanel);
    createPaintShortcuts({
      closePanel: variant.closePanel,
      tool,
      chooseTool,
      selectionAction: selection.action,
      deselect: selection.clear,
      selectAll: selection.selectAll,
      invertSelection: selection.invert,
      chooseWand() {
        selection.setTool('wand');
        chooseTool('lasso');
      },
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
        if (localUndo.open()) {
          void localUndo.apply();
          return true;
        }

        if (transform.active()) {
          void transform.end();
          return true;
        }

        if (selection.drawing()) {
          selection.finish();
          return true;
        }

        return false;
      },
      cancel() {
        quickShape.cancel();
        // Escape ends a local undo session without deselecting.
        if (localUndo.open()) {
          void localUndo.cancel();
          return;
        }

        void transform.cancel();
        mixer.cancelPick();
        colorPicker.cancel();
        camera.navigation.close();
        // Escape ends a selection gesture, and otherwise deselects.
        if (selection.drawing()) {
          selection.cancel();
        } else {
          selection.clear();
        }

        edit({ type: 'cancel' });
      }
    });
  }

  /** Symmetry may change: the engine accepts commands and no selection edit is waiting for it. */
  function canUpdateSymmetry() {
    return engine.canEdit() && !selection.busy();
  }

  /** Brush settings may change: no stroke, selection edit, brush command or preset upload is running. */
  function canChangeBrush() {
    return engine.canEdit() && !selection.isBusy() && !engine.isDrawing() && !engine.isCommandBusy();
  }

  /** The active tool when it works with the selection: the lasso, or the fill or gradient inside the selection. */
  function selectionTool() {
    const current = tool();
    return current === 'lasso' || current === 'fill' || current === 'gradient' ? current : undefined;
  }

  /**
   * Switches tools, applying a transform in progress. The selection stays, so brushes, the fill and the gradient work
   * inside it; a lasso gesture in progress is cancelled. The fill and the gradient work only inside a selection, so
   * without one they are refused.
   */
  function chooseTool(next: PaintTool) {
    if (transform.active()) {
      void transform.end();
    }

    if (selection.isBusy() || next === tools.tool()) {
      return;
    }

    if ((next === 'fill' || next === 'gradient') && !selection.selected()) {
      return;
    }

    mixer.cancelPick();
    colorPicker.cancel();
    selection.cancel();
    tools.chooseTool(next);
  }

  /**
   * Chooses the local undo and opens its window, which holds the tool's settings, Apply and Cancel: the one control
   * a variant without a place for them needs; see `SessionWindows`.
   */
  function chooseLocalUndo() {
    chooseTool('local-undo');
    windows.open('local-undo');
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

  /** Clears the failure and restarts the renderer, which repeats the ready handshake and the preset upload. */
  function restoreRenderer() {
    setError(undefined);
    edit({ type: 'recover' });
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

  /** Changes the painting color, leaving only the eraser for the brush. Does not load the Mixer Brush reservoir. */
  function setColor(color: string) {
    if (tool() === 'eraser') {
      chooseTool('brush');
    }

    tools.updateBrush({ color });
  }

  /**
   * Toggles a tool back to the previous brush slot. Fill without a selection chooses the lasso and returns false,
   * allowing the caller to explain the required selection. Local undo also opens its settings window.
   */
  function toggleTool(next: 'eraser' | 'lasso' | 'fill' | 'local-undo') {
    if (tool() === next) {
      chooseTool(next === 'eraser' ? 'brush' : tools.slot());
      return true;
    }

    if (next === 'fill' && !selection.selected()) {
      chooseTool('lasso');
      return false;
    }

    if (next === 'local-undo') {
      chooseLocalUndo();
    } else {
      chooseTool(next);
    }

    return true;
  }

  /**
   * Loads the brush with `color`, as from a mixing palette: the fill and the gradient keep their tool and use it, other
   * tools switch to the brush; a Mixer Brush preset also fills its reservoir with it.
   */
  function loadColor(color: string) {
    if (tool() !== 'brush' && tool() !== 'fill' && tool() !== 'gradient') {
      chooseTool('brush');
    }

    tools.updateBrush({ color });
    // The Mixer Brush command reads the brush's color, written just now.
    flush();
    if (mixer.available()) {
      void mixer.command('load');
    }
  }

  /** Paints with preset `id`: the eraser keeps erasing with it, other tools switch to the brush. */
  function usePreset(id: string) {
    const slot = tool() === 'eraser' ? 'eraser' : 'brush';
    if (tool() !== slot) {
      chooseTool(slot);
    }

    void choosePreset(id, slot);
  }

  /**
   * Remembers the tools as they are now: the tool and the selection tool, the brush's and the eraser's presets with
   * their settings, and the colors. The returned function puts them back, first uploading a preset's images again
   * where a brush tool has changed presets since; it cancels a color or paint pick in progress.
   */
  function rememberTools() {
    const saved = tools.snapshot();
    const savedSelectionTool = selection.tool();
    return async () => {
      for (const slot of ['brush', 'eraser'] as const) {
        const preset = library.find(saved.slots[slot].preset);
        if (preset && preset.id !== tools.snapshot().slots[slot].preset) {
          await uploads.choose(preset, slot);
        }
      }

      if (selection.tool() !== savedSelectionTool) {
        selection.setTool(savedSelectionTool);
      }

      mixer.cancelPick();
      colorPicker.cancel();
      tools.restoreSnapshot(saved);
    };
  }

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

  /** The active tool paints with a brush: the brush or the eraser. */
  function paintsWithBrush() {
    return tool() === 'brush' || tool() === 'eraser';
  }

  /** The local undo marks its area with the mask brush, which shows its own cursor. */
  function masksWithBrush() {
    return tool() === 'local-undo' && localUndo.settings().mode === 'brush';
  }

  /** The current tool paints symmetric copies. */
  function supportsSymmetry() {
    return supportsPaintSymmetry(brush()) && paintsWithBrush();
  }

  /** The brush is an ABR block eraser, which erases a fixed square in screen pixels. */
  function blockCursor() {
    return brush().engine?.id === 'abr' && isBlockEraser(record(record(brush().engine?.settings).values).tool);
  }

  /** The brush cursor's diameter in screen pixels. */
  function cursorSize() {
    return blockCursor() ? blockEraserSize : Math.max(2, brush().size * camera.camera().zoom);
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
}

/** A drawing session; see `createPaintSession`. */
export type PaintSession = ReturnType<typeof createPaintSession>;

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

/** The corners of `bounds`, clockwise from the top-left, as points; none without bounds. */
function boundsCorners(bounds: { left: number; top: number; right: number; bottom: number } | undefined) {
  return (
    bounds && [
      { x: bounds.left, y: bounds.top },
      { x: bounds.right, y: bounds.top },
      { x: bounds.right, y: bounds.bottom },
      { x: bounds.left, y: bounds.bottom }
    ]
  );
}
