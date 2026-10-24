import { NavigationPuck } from '@app-game/navigation-puck';
import { screenToWorld, worldToScreen } from '@app-game/paint-core/camera';
import { createEventListener } from '@solid-primitives/event-listener';
import type { JSX } from '@solidjs/web';
import { createEffect, createSignal, Match, Show, Switch } from 'solid-js';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import { AbrViewerDialog } from '../abr';
import { BrushLibraryPanel, maxBrushSize, MixerActions, type PaintTool } from '../brush';
import { BrushSizeGrid } from '../brush-size';
import { ColorPanel, ColorPickerSettings } from '../color';
import { ColorWheel } from '../color-wheel';
import { DeveloperDialog } from '../developer';
import { DrawingFolderControls } from '../drawing-folder';
import { FillPanel } from '../fill';
import { FrameEditor, FramesSection } from '../frames';
import { FreshTabControls } from '../fresh-tab';
import { GradientPanel } from '../gradient';
import { LocalUndoPanel } from '../local-undo';
import { HueTriangle } from '../hue-triangle';
import { HistorySourceControl, LayersPanel } from '../layers';
import { LiveBadge, LiveControls, LiveViewer, liveRelayUrl, watchedRoom, watchLink } from '../live';
import { PalmRejectionControls } from '../palm-rejection';
import { PressureCalibrationButton } from '../pressure-calibration';
import { QuickShapeSettings } from '../quickshape';
import { createRadialMenu, RadialMenu, type RadialItem } from '../radial-menu';
import { RecordingControls } from '../recording';
import { SelectionActions } from '../selection';
import {
  createPaintSession,
  PaintEditor,
  PaintStage,
  SessionNotices,
  StageDiagnostics,
  StageGuides,
  StageHint,
  StageOverlays
} from '../session';
import { SymmetryPanel } from '../symmetry';
import { ViewOptionsControls } from '../view-options';
import { createPanelPins } from './createPanelPins';
import { DrawingMenu } from './DrawingMenu';
import styles from './PaintStudio.module.css';
import { panelTitles, StudioPanel, type PanelId } from './StudioPanel';
import { ToolBar } from './ToolBar';
import { ViewControls } from './ViewControls';

/**
 * Paint Studio, the Classic variant: a full-window infinite canvas with on-demand controls; opening panels never
 * resizes the drawing surface. The drawing session supplies the engine, tools and feature controllers; this layout
 * adds the toolbar, the brush and color puck, side panels, the radial menu around the navigation puck and the
 * developer tools.
 */
export function PaintStudio(props: {
  /** Link back to the embedding playground; omitted in the standalone app. */
  experimentsHref?: string;
  /** Host-specific controls shown in the drawing menu. */
  applicationControls?: JSX.Element;
}) {
  // A watch link opens a live viewer instead of the editor.
  const room = watchedRoom(location);
  if (room) {
    return <LiveViewer room={room} url={liveRelayUrl(location, import.meta.env.DEV)} />;
  }

  const [panel, setPanel] = createSignal<PanelId>();
  const session = createPaintSession({ panel });
  const {
    library,
    tools,
    brush,
    tool,
    engine,
    ready,
    selection,
    edit,
    size,
    camera,
    symmetry,
    mixer,
    uploads,
    presets,
    colorPicker,
    images,
    fill,
    gradient,
    transform,
    localUndo,
    fullscreen,
    colorWheel,
    viewOptions,
    drawingFolder,
    frames,
    layerFilter,
    recentPresets,
    live,
    recorder,
    developer,
    palmSettings,
    penHover,
    freshTab,
    chooseTool,
    toggleTransform,
    choosePreset,
    usePreset,
    canUpdateSymmetry,
    canChangeBrush,
    selectionTool,
    paintsWithBrush,
    supportsSymmetry,
    blockCursor,
    boundsCorners
  } = session;
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

  const panelPins = createPanelPins();
  // Panels leave the canvas usable: a contact on it closes an unpinned panel and still draws or navigates.
  createEventListener(
    session.stage,
    'pointerdown',
    (event) => {
      const open = panel();
      const onCanvas = event.target instanceof HTMLCanvasElement && !event.target.closest('#paint-panel');
      if (open && onCanvas && !panelPins.pinned(open)) {
        setPanel(undefined);
      }
    },
    { capture: true }
  );
  const [abrOpen, setAbrOpen] = createSignal(false);
  const [abrMounted, setAbrMounted] = createSignal(false);
  const [developerOpen, setDeveloperOpen] = createSignal(false);
  /** The active frame shows handles for changing its rectangle; ends when another frame or none becomes active. */
  const [adjustingFrame, setAdjustingFrame] = createSignal<string>();
  /** The control that opened the current panel or dialog; focus returns to it on close. */
  let launcher: HTMLElement | undefined;

  session.createShortcuts({
    closePanel() {
      if (!panel()) {
        return false;
      }

      closePanel();
      return true;
    }
  });

  function togglePanel(next: PanelId, target: HTMLElement) {
    launcher = target;
    camera.navigation.close();
    setPanel(panel() === next ? undefined : next);
  }

  function closePanel() {
    setPanel(undefined);
    launcher?.focus({ preventScroll: true });
  }

  /**
   * Opens the settings of the active tool: the panel of the fill, the gradient or the local undo for them, otherwise
   * the brush panel and its presets.
   */
  function openBrushSettings(target: HTMLElement) {
    if (tool() === 'fill' || tool() === 'gradient' || tool() === 'local-undo') {
      togglePanel(tool() as 'fill' | 'gradient' | 'local-undo', target);
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

  return (
    <PaintEditor session={session} class={styles.studio}>
      <PaintStage session={session} input={{ puckPicker: radial.picker }}>
        <StageGuides session={session} />
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
        <StageDiagnostics session={session} />
        <Show when={ready() && engine.state().tileCount === 0}>
          <StageHint>Pen to draw. Touch to move.</StageHint>
        </Show>
        <StageOverlays session={session} />
        <Show when={camera.navigation.center()}>
          {(center) => (
            <NavigationPuck navigation={camera.navigation} focusTarget={() => session.canvas()!}>
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
      </PaintStage>
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
        <Show when={selectionTool() && !transform.active()}>
          <SelectionActions
            outline={boundsCorners(selection.summary().bounds)?.map((point) =>
              worldToScreen(point, camera.camera(), size())
            )}
            selected={selection.selected() && !selection.drawing()}
            size={size()}
            disabled={!ready() || selection.drawing()}
            busy={selection.busy()}
            hasClipboard={selection.hasClipboard()}
            onAction={selection.action}
            onTransform={toggleTransform}
            onDeselect={selection.clear}
            onSelectAll={selection.selectAll}
            onInvert={selection.invert}
            onFeather={selection.feather}
            selectionTool={selection.tool()}
            onSelectionTool={selection.setTool}
            mode={selection.mode()}
            onMode={selection.setMode}
            wand={selection.wand()}
            onWand={selection.updateWand}
            tool={selectionTool()!}
            onTool={chooseTool}
            onFillSelection={gradient.fillSelection}
          />
        </Show>
        <SessionNotices session={session} />
        <LiveBadge live={live} />
        <div class={styles.doublePuck} aria-label="Brush and color">
          <button
            aria-label="Brush settings"
            title="Brush settings"
            aria-expanded={
              panel() === 'brush' || panel() === 'fill' || panel() === 'gradient' || panel() === 'local-undo'
                ? 'true'
                : 'false'
            }
            aria-controls="paint-panel"
            onClick={(event) => openBrushSettings(event.currentTarget)}
          >
            <SketchIcon
              name={
                tool() === 'fill' || tool() === 'gradient'
                  ? tool() as 'fill' | 'gradient'
                  : tool() === 'local-undo'
                    ? 'localUndo'
                    : tool() === 'eraser'
                      ? 'erase'
                      : brush().engine?.id === 'abr'
                        ? 'brush'
                        : 'draw'
              }
              size={22}
            />
            <small>
              {tool() === 'local-undo'
                ? Math.round(localUndo.settings().size)
                : blockCursor()
                  ? 'Block'
                  : Math.round(brush().size)}
            </small>
          </button>
          <BrushSizeGrid
            size={brush().size}
            max={maxBrushSize(brush())}
            disabled={!paintsWithBrush() || blockCursor() || transform.active() || !canChangeBrush()}
            onPreview={(size) => tools.updateBrush({ size })}
            onPick={(size) => tools.updateBrush({ size })}
          />
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
          <button
            aria-label="Pick color from canvas"
            title="Pick color from canvas · Alt/Option-click"
            aria-pressed={colorPicker.armed() ? 'true' : 'false'}
            onClick={() => {
              if (colorPicker.armed()) {
                colorPicker.cancel();
                return;
              }

              closePanel();
              colorPicker.arm();
            }}
          >
            <SketchIcon name="picker" size={22} />
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
            <StudioPanel
              id={id}
              title={panelTitles[id]}
              pinned={panelPins.pinned(id)}
              onPinnedChange={(pinned) => panelPins.setPinned(id, pinned)}
              onClose={closePanel}
            >
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
                  <QuickShapeSettings settings={session.quickShape.settings()} onChange={session.quickShape.update} />
                </Match>
                <Match when={id === 'fill'}>
                  <FillPanel settings={fill.settings()} onChange={fill.update} />
                </Match>
                <Match when={id === 'local-undo'}>
                  <LocalUndoPanel
                    settings={localUndo.settings()}
                    onChange={localUndo.update}
                    depth={localUndo.depth()}
                    onDepth={localUndo.setDepth}
                    open={localUndo.open()}
                    shown={localUndo.shown()}
                    onApply={() => void localUndo.apply()}
                    onCancel={() => void localUndo.cancel()}
                  />
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
                    alternatives={{
                      chosen: colorWheel.settings().picker,
                      onChoose: (picker) =>
                        colorWheel.update({ picker: picker === 'wheel' || picker === 'triangle' ? picker : 'square' }),
                      options: [
                        {
                          id: 'triangle',
                          label: 'Triangle',
                          render: (control) => (
                            <HueTriangle color={control.color} onChange={control.onChange} onSettle={control.onSettle} />
                          )
                        },
                        {
                          id: 'wheel',
                          label: 'Wheel',
                          render: (control) => (
                            <ColorWheel
                              color={control.color}
                              onChange={control.onChange}
                              onSettle={control.onSettle}
                              settings={colorWheel.settings()}
                              onSettings={colorWheel.update}
                            />
                          )
                        }
                      ]
                    }}
                  />
                  <ColorPickerSettings
                    source={colorPicker.settings.source()}
                    size={colorPicker.settings.size()}
                    onChange={colorPicker.settings.update}
                  />
                  <div class={styles.fileActions}>
                    <button
                      aria-pressed={session.windows.isOpen('palette') ? 'true' : 'false'}
                      onClick={() => session.windows.toggle('palette')}
                    >
                      Mixing palette
                      <span>{session.windows.isOpen('palette') ? 'Close the window' : 'Mix paint in a window'}</span>
                    </button>
                  </div>
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
                    onExport={({ left, top, width, height, name }, format) =>
                      edit({ type: format, region: { left, top, width, height }, name: `${name}.${format}` })
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
                    onLinearBlending={(linear) => edit({ type: 'blending', linear })}
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
                    onExportPsd={() => {
                      edit({ type: 'psd' });
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
                    folderControls={<DrawingFolderControls folder={drawingFolder} ready={ready()} />}
                    liveControls={
                      <LiveControls live={live} link={(watched) => watchLink(location, watched)} ready={ready()} />
                    }
                    pressureCalibration={
                      <PressureCalibrationButton
                        calibrated={!!session.pressureCalibration.calibration()}
                        onOpen={() => {
                          closePanel();
                          session.windows.open('pressure');
                        }}
                      />
                    }
                    viewOptions={
                      <ViewOptionsControls settings={viewOptions.settings()} onChange={viewOptions.update} />
                    }
                    palmRejection={
                      <PalmRejectionControls
                        settings={palmSettings.settings()}
                        penHovers={penHover.hovers()}
                        onChange={palmSettings.update}
                      />
                    }
                    penHover={
                      session.nativeShell.active ? undefined : (
                        <FreshTabControls auto={freshTab.auto()} onChange={freshTab.setAuto} />
                      )
                    }
                    applicationControls={props.applicationControls}
                    experimentsHref={props.experimentsHref}
                  />
                </Match>
              </Switch>
            </StudioPanel>
          )}
        </Show>
      </div>      <Show when={developerOpen()}>
        <DeveloperDialog
          settings={developer}
          ready={ready()}
          workerEnabled={engine.mode() === 'worker'}
          switching={engine.switching()}
          metrics={engine.metrics()}
          onWorkerEnabledChange={session.setWorkerEnabled}
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
    </PaintEditor>
  );

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
      toolItem('local-undo', 'Local undo', 'localUndo', 2),
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
}

/** Up to three letters naming a preset in the radial menu: the initials of its words, or the start of one word. */
function initials(name: string) {
  const words = name.split(/[\s_-]+/).filter(Boolean);
  return (words.length > 1 ? words.map((word) => word[0]).join('') : (words[0] ?? '')).slice(0, 3).toUpperCase();
}

/** Save indicator text for each engine save state. */
const saveStatus = {
  saved: { label: 'Saved', title: 'Saved on this device' },
  saving: { label: 'Saving…', title: 'Writing completed changes to this device' },
  unsaved: { label: 'Unsaved changes', title: 'Changes are saved automatically after the stroke finishes' }
} as const;
