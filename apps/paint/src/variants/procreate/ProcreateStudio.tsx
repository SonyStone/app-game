import { NavigationPuck } from '@app-game/navigation-puck';
import type { PaintSymmetry } from '@app-game/paint-core/symmetry';
import { createEventListener } from '@solid-primitives/event-listener';
import type { JSX } from '@solidjs/web';
import { createEffect, createSignal, Errored, Match, Show, Switch } from 'solid-js';
import type { PaintVariantProps } from '..';
import { AbrViewerDialog } from '../../features/abr';
import { maxBrushSize } from '../../features/brush';
import { createRecentColors } from '../../features/color/createRecentColors';
import {
  createPaintSession,
  PaintEditor,
  PaintStage,
  SessionNotices,
  StageGuides,
  StageOverlays
} from '../../features/session';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import { ActionsPopover } from './ActionsPopover';
import { BrushLibrary } from './BrushLibrary';
import { ColorsPopover, type ColorMode } from './ColorsPopover';
import { GalleryPopover } from './GalleryPopover';
import { ProcreateIcon, type ProcreateIconName } from './icons';
import { LayersPopover } from './LayersPopover';
import menu from './menu.module.css';
import { Popover } from './Popover';
import styles from './ProcreateStudio.module.css';
import { SelectionToolbar } from './SelectionToolbar';
import { BrushPreview, SidebarSlider } from './Sidebar';
import sidebarStyles from './Sidebar.module.css';
import {
  geometricFraction,
  geometricValue,
  linearFraction,
  linearValue,
  minBrushSize,
  minOpacity
} from './sliderScale';
import { watchTapTargets } from '../../shared/ui/watchTapTargets';

/**
 * The Procreate variant: a close copy of Procreate's iPad interface on Paint's engine, as the reference testers
 * already know. A dark top bar holds Gallery (the drawing's file commands), Actions, Selection and Transform on the
 * left and Paint, Erase, Layers and Colors on the right; tapping the active Paint or Erase again opens its Brush
 * Library. The sidebar at the screen's edge has the brush size and opacity sliders, the Modify button (eyedropper),
 * Undo and Redo. Touch gestures: two fingers tap to undo, three to redo, four hide the interface, and a held finger
 * picks a color; pinch, twist and drag move the view. One popover is open at a time; any press outside it closes it,
 * and on the canvas the press does nothing else.
 *
 * Procreate's Adjustments, Smudge and gallery screen are left out: Paint has no adjustments, no smudge tool and one
 * drawing.
 */
export function ProcreateStudio(props: PaintVariantProps) {
  const [popover, setPopover] = createSignal<OpenPopover>();
  const session = createPaintSession({ panel: () => popover()?.id });
  const {
    library,
    tools,
    brush,
    tool,
    engine,
    ready,
    selection,
    camera,
    symmetry,
    mixer,
    uploads,
    presets,
    colorPicker,
    images,
    gradient,
    transform,
    fullscreen,
    recentPresets,
    chooseTool,
    toggleTransform,
    choosePreset,
    edit
  } = session;
  const recentColors = createRecentColors();
  const [colorMode, setColorMode] = createSignal<ColorMode>('disc');
  const [sidebar, setSidebar] = createInterfaceSide();
  /** The interface is hidden by a four-finger tap, leaving the canvas alone, as Procreate's full-screen mode does. */
  const [hidden, setHidden] = createSignal(false);
  const [abrOpen, setAbrOpen] = createSignal(false);
  const [abrMounted, setAbrMounted] = createSignal(false);
  const [ui, setUi] = createSignal<HTMLElement>();

  session.createShortcuts({
    closePanel() {
      if (!popover()) {
        return false;
      }

      setPopover(undefined);
      return true;
    }
  });

  // A press outside the open popover and its button closes the popover. On the canvas it only closes it, as in
  // Procreate, so the press neither paints nor navigates.
  createEventListener(
    document,
    'pointerdown',
    (event) => {
      const open = popover();
      const target = event.target;
      if (!open || !(target instanceof Element) || target.closest('[data-popover]') || open.anchor.contains(target)) {
        return;
      }

      setPopover(undefined);
      if (target instanceof HTMLCanvasElement) {
        event.stopPropagation();
        event.preventDefault();
      }
    },
    { capture: true }
  );

  // Chrome's touch adjustment would move a finger's press off the sliders and the Disc onto a nearby button.
  createEffect(ui, (element) => (element ? watchTapTargets(element) : undefined));

  /** Opens popover `id` under `anchor`, or closes it when it is the one open. */
  function togglePopover(id: OpenPopover['id'], anchor: HTMLElement) {
    camera.navigation.close();
    setPopover(popover()?.id === id ? undefined : { id, anchor });
  }

  /** Paint and Erase: the first tap chooses the tool, a tap on the active tool opens its Brush Library. */
  function chooseBrushTool(slot: 'brush' | 'eraser', anchor: HTMLElement) {
    if (tool() !== slot || transform.active()) {
      setPopover(undefined);
      chooseTool(slot);
      return;
    }

    void library.loadAll();
    togglePopover(slot, anchor);
  }

  /**
   * Selection: activates the selection tools, or returns to the last painting tool while they, or the fill and
   * gradient that work in the selection, are active.
   */
  function toggleSelection() {
    setPopover(undefined);
    chooseTool(session.selectionTool() ? tools.slot() : 'lasso');
  }

  /**
   * Local undo, not a Procreate tool: chooses it with its settings window (see `PaintSession.chooseLocalUndo`), or
   * returns to the last painting tool while it is active, as Selection does.
   */
  function toggleLocalUndo() {
    setPopover(undefined);
    if (tool() === 'local-undo') {
      chooseTool(tools.slot());
      return;
    }

    session.chooseLocalUndo();
  }

  function toggleEyedropper() {
    setPopover(undefined);
    if (colorPicker.armed()) {
      colorPicker.cancel();
      return;
    }

    colorPicker.arm();
  }

  /** Opens the ABR importer from the Brush Library. */
  function openAbrViewer() {
    setPopover(undefined);
    setAbrMounted(true);
    setAbrOpen(true);
  }

  function setSymmetry(mode: PaintSymmetry['mode']) {
    const current = symmetry.symmetry();
    // A guide turned on starts at the center of the view.
    const center = current.mode === 'off' ? { x: camera.camera().x, y: camera.camera().y } : {};
    symmetry.update({ ...current, ...center, mode });
  }

  /** Brush size and opacity can change: a painting tool is active and no stroke or upload is running. */
  const adjustable = () => session.paintsWithBrush() && !transform.active() && session.canChangeBrush();
  const maxSize = () => maxBrushSize(brush());

  return (
    <PaintEditor session={session} class={styles.editor}>
      <PaintStage
        session={session}
        input={{
          touchGestures: {
            tap(fingers) {
              if (fingers === 2 && engine.state().canUndo) {
                session.undo();
              }

              if (fingers === 3 && engine.state().canRedo) {
                session.redo();
              }

              if (fingers === 4) {
                setPopover(undefined);
                setHidden(!hidden());
              }
            },
            // Touch and hold: the eyedropper follows the finger and picks the color where it lifts.
            hold(point) {
              if (!ready() || transform.active()) {
                return;
              }

              colorPicker.canvasAction.run(point);
              return { move: colorPicker.canvasAction.move, end: colorPicker.canvasAction.end };
            }
          }
        }}
      >
        <StageGuides session={session} />
        <StageOverlays session={session} />
        <Show when={camera.navigation.center()}>
          <NavigationPuck navigation={camera.navigation} focusTarget={() => session.canvas()!} />
        </Show>
      </PaintStage>
      <div ref={setUi} class={styles.ui} data-side={sidebar()}>
        <Show
          when={!hidden()}
          fallback={
            <button class={styles.showInterface} aria-label="Show the interface" onClick={() => setHidden(false)}>
              <ProcreateIcon name="showInterface" size={20} />
            </button>
          }
        >
          <header class={styles.bar}>
            <div class={styles.group}>
              <button
                class={styles.gallery}
                aria-expanded={popover()?.id === 'gallery' ? 'true' : 'false'}
                onClick={(event) => togglePopover('gallery', event.currentTarget)}
              >
                Gallery
              </button>
              <BarButton
                label="Actions"
                icon="wrench"
                expanded={popover()?.id === 'actions'}
                onClick={(event) => togglePopover('actions', event.currentTarget)}
              />
              <BarButton
                label="Selection"
                icon="selection"
                active={session.selectionTool() !== undefined && !transform.active()}
                onClick={toggleSelection}
              />
              <BarButton label="Transform" icon="transform" active={transform.active()} onClick={toggleTransform} />
              <BarButton
                label="Local undo"
                icon="localUndo"
                active={tool() === 'local-undo' && !transform.active()}
                onClick={toggleLocalUndo}
              />
            </div>
            <div class={styles.group}>
              <BarButton
                label="Paint"
                icon="brush"
                active={tool() === 'brush' && !transform.active()}
                expanded={popover()?.id === 'brush'}
                onClick={(event) => chooseBrushTool('brush', event.currentTarget)}
              />
              <BarButton
                label="Erase"
                icon="eraser"
                active={tool() === 'eraser' && !transform.active()}
                expanded={popover()?.id === 'eraser'}
                onClick={(event) => chooseBrushTool('eraser', event.currentTarget)}
              />
              <BarButton
                label="Layers"
                icon="layers"
                expanded={popover()?.id === 'layers'}
                onClick={(event) => togglePopover('layers', event.currentTarget)}
              />
              <button
                class={styles.colorButton}
                aria-label="Colors"
                title="Colors"
                aria-expanded={popover()?.id === 'colors' ? 'true' : 'false'}
                onClick={(event) => togglePopover('colors', event.currentTarget)}
              >
                <span style={{ background: brush().color }} />
              </button>
            </div>
          </header>
          <Errored fallback={null}>
            <div class={sidebarStyles.dock} data-side={sidebar()}>
              <div class={sidebarStyles.sidebar} role="toolbar" aria-orientation="vertical" aria-label="Sidebar">
                <SidebarSlider
                  label="Brush size"
                  value={brush().size}
                  toFraction={(size) => geometricFraction(size, minBrushSize, maxSize())}
                  fromFraction={(fraction) => geometricValue(fraction, minBrushSize, maxSize())}
                  side={sidebar()}
                  disabled={!adjustable() || session.blockCursor()}
                  valueText={`${formatSize(brush().size)} px`}
                  onChange={(size) => tools.updateBrush({ size })}
                  preview={
                    <BrushPreview
                      diameter={brush().size * camera.camera().zoom}
                      color={tool() === 'eraser' ? '#8e8e93' : brush().color}
                      opacity={1}
                      label={`${formatSize(brush().size)} px`}
                    />
                  }
                />
                <button
                  class={sidebarStyles.modify}
                  aria-label="Eyedropper"
                  title="Eyedropper · then touch the canvas"
                  aria-pressed={colorPicker.armed() ? 'true' : 'false'}
                  onClick={toggleEyedropper}
                >
                  <span />
                </button>
                <SidebarSlider
                  label="Brush opacity"
                  value={brush().opacity}
                  toFraction={(opacity) => linearFraction(opacity, minOpacity, 1)}
                  fromFraction={(fraction) => Math.round(linearValue(fraction, minOpacity, 1) * 100) / 100}
                  side={sidebar()}
                  disabled={!adjustable()}
                  valueText={`${Math.round(brush().opacity * 100)} %`}
                  onChange={(opacity) => tools.updateBrush({ opacity })}
                  preview={
                    <BrushPreview
                      diameter={64}
                      color={tool() === 'eraser' ? '#8e8e93' : brush().color}
                      opacity={brush().opacity}
                      checkered
                      label={`${Math.round(brush().opacity * 100)}%`}
                    />
                  }
                />
                <button
                  class={sidebarStyles.history}
                  aria-label="Undo"
                  aria-keyshortcuts="Control+Z Meta+Z"
                  title="Undo · two-finger tap"
                  disabled={!engine.state().canUndo || !ready()}
                  onClick={() => session.undo()}
                >
                  <SketchIcon name="undo" size={24} />
                </button>
                <button
                  class={sidebarStyles.history}
                  aria-label="Redo"
                  aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z"
                  title="Redo · three-finger tap"
                  disabled={!engine.state().canRedo || !ready()}
                  onClick={() => session.redo()}
                >
                  <SketchIcon name="redo" size={24} />
                </button>
              </div>
            </div>
          </Errored>
          <Show when={session.selectionTool() && !transform.active()}>
            <SelectionToolbar
              tool={selection.tool()}
              onTool={selection.setTool}
              mode={selection.mode()}
              onMode={selection.setMode}
              selected={selection.selected() && !selection.drawing()}
              disabled={!ready() || selection.drawing() || selection.busy()}
              wand={selection.wand()}
              onWand={selection.updateWand}
              onInvert={selection.invert}
              onFeather={selection.feather}
              onColorFill={gradient.fillSelection}
              onClear={selection.clear}
            />
          </Show>
        </Show>
        <Show when={popover()} keyed>
          {(open) => (
            <Errored fallback={<p class={styles.failed}>This panel failed to open.</p>}>
              <Popover anchor={open.anchor} width={popoverWidths[open.id]} label={popoverLabels[open.id]}>
                <Switch>
                  <Match when={open.id === 'gallery'}>
                    <GalleryPopover
                      ready={ready()}
                      onOpen={(file) => {
                        setPopover(undefined);
                        edit({ type: 'import', file });
                      }}
                      onInsertImage={(file) => {
                        setPopover(undefined);
                        images.place(file);
                      }}
                      onSave={() => {
                        setPopover(undefined);
                        edit({ type: 'download' });
                      }}
                      onExportPng={() => {
                        setPopover(undefined);
                        edit({ type: 'png' });
                      }}
                      onExportPsd={() => {
                        setPopover(undefined);
                        edit({ type: 'psd' });
                      }}
                      onResetView={() => {
                        setPopover(undefined);
                        camera.reset();
                      }}
                      experimentsHref={props.experimentsHref}
                    />
                  </Match>
                  <Match when={open.id === 'actions'}>
                    <ActionsPopover
                      ready={ready()}
                      selected={selection.selected()}
                      hasClipboard={selection.hasClipboard()}
                      mirrored={camera.camera().mirrored}
                      symmetry={symmetry.symmetry().mode}
                      sidebar={sidebar()}
                      fullscreen={{ active: fullscreen.isActive(), supported: document.fullscreenEnabled, shown: fullscreen.shown }}
                      onInsertPhoto={(file) => {
                        setPopover(undefined);
                        images.place(file);
                      }}
                      onSelectionAction={(action) => {
                        setPopover(undefined);
                        selection.action(action);
                      }}
                      onFlip={camera.toggleMirror}
                      onSymmetry={setSymmetry}
                      onResetView={() => {
                        setPopover(undefined);
                        camera.reset();
                      }}
                      onResetRotation={camera.resetRotation}
                      onShare={(format) => {
                        setPopover(undefined);
                        edit({ type: format });
                      }}
                      onSidebar={setSidebar}
                      onFullscreen={() => void fullscreen.props.onClick()}
                      onPen={() => {
                        setPopover(undefined);
                        session.windows.open('pen');
                      }}
                      quickShape={session.quickShape.settings()}
                      onQuickShape={session.quickShape.update}
                    />
                  </Match>
                  <Match when={open.id === 'brush' || open.id === 'eraser'}>
                    <BrushLibrary
                      title="Brush Library"
                      presets={library.presets()}
                      recent={[tools.preset(), ...recentPresets.recent(7)]}
                      preset={open.id === 'eraser' && tools.eraserMode() === 'clear' ? '' : tools.preset()}
                      disabled={!ready() || uploads.busy()}
                      onChoose={(id) => void choosePreset(id, open.id === 'eraser' ? 'eraser' : 'brush')}
                      onImport={openAbrViewer}
                      footer={
                        <Show when={open.id === 'brush' && mixer.available()}>
                          <div class={menu.list}>
                            <h3 class={menu.sectionTitle}>Mixer Brush</h3>
                            <button
                              class={menu.row}
                              disabled={!ready() || engine.commandBusy()}
                              onClick={() => void mixer.command('load')}
                            >
                              <span class={menu.label}>Load the brush</span>
                            </button>
                            <button
                              class={menu.row}
                              disabled={!ready() || engine.commandBusy()}
                              onClick={() => void mixer.command('clean')}
                            >
                              <span class={menu.label}>Clean the brush</span>
                            </button>
                            <button
                              class={menu.row}
                              disabled={!ready() || engine.commandBusy()}
                              onClick={() => {
                                setPopover(undefined);
                                mixer.pick();
                              }}
                            >
                              <span class={menu.label}>Load paint from the canvas</span>
                            </button>
                          </div>
                        </Show>
                      }
                    >
                      <Show when={open.id === 'eraser'}>
                        <button
                          class={[menu.row, styles.eraserMode]}
                          role="switch"
                          aria-checked={tools.eraserMode() === 'clear' && tools.canClear() ? 'true' : 'false'}
                          disabled={!tools.canClear()}
                          onClick={() => tools.setEraserMode(tools.eraserMode() === 'clear' ? 'preset' : 'clear')}
                        >
                          <span class={menu.label}>Erase with the current brush</span>
                          <span class={menu.switch} />
                        </button>
                      </Show>
                    </BrushLibrary>
                  </Match>
                  <Match when={open.id === 'layers'}>
                    <LayersPopover
                      state={engine.state()}
                      ready={ready()}
                      onAction={(action) => edit({ type: 'layer', action })}
                    />
                  </Match>
                  <Match when={open.id === 'colors'}>
                    <ColorsPopover
                      color={brush().color}
                      secondary={brush().backgroundColor ?? '#ffffff'}
                      recent={recentColors.colors()}
                      mode={colorMode()}
                      onMode={setColorMode}
                      onInput={(color) => tools.updateBrush({ color })}
                      onCommit={recentColors.remember}
                      onSwap={tools.swapColors}
                      mixing={session.windows.isOpen('palette')}
                      onMixing={() => session.windows.toggle('palette')}
                    />
                  </Match>
                </Switch>
              </Popover>
            </Errored>
          )}
        </Show>
        <SessionNotices session={session} />
      </div>
      <Show when={abrMounted()}>
        <AbrViewerDialog
          open={abrOpen()}
          close={() => setAbrOpen(false)}
          mixing={brush().mixing}
          onMixingChange={(mixing) => tools.updateBrush({ mixing })}
          onUseBrush={(asset) => {
            mixer.cancelPick();
            colorPicker.cancel();
            return presets.useBrush(asset);
          }}
        />
      </Show>
    </PaintEditor>
  );
}

/** The open popover and the toolbar button it hangs from. */
type OpenPopover = {
  id: 'gallery' | 'actions' | 'brush' | 'eraser' | 'layers' | 'colors';
  anchor: HTMLElement;
};

const popoverWidths: Record<OpenPopover['id'], number> = {
  gallery: 300,
  actions: 360,
  brush: 470,
  eraser: 470,
  layers: 340,
  colors: 340
};

const popoverLabels: Record<OpenPopover['id'], string> = {
  gallery: 'Drawing',
  actions: 'Actions',
  brush: 'Brush Library',
  eraser: 'Eraser Brush Library',
  layers: 'Layers',
  colors: 'Colors'
};

/** An icon button of the top bar, blue while its tool is active. */
function BarButton(props: {
  label: string;
  icon: ProcreateIconName;
  active?: boolean;
  /** The button's popover is open; omitted for buttons without one. */
  expanded?: boolean;
  onClick: JSX.EventHandler<HTMLButtonElement, MouseEvent>;
}) {
  return (
    <button
      class={styles.barButton}
      aria-label={props.label}
      title={props.label}
      aria-pressed={props.active === undefined ? undefined : props.active ? 'true' : 'false'}
      aria-expanded={props.expanded === undefined ? undefined : props.expanded ? 'true' : 'false'}
      onClick={(event) => props.onClick(event)}
    >
      <ProcreateIcon name={props.icon} size={24} />
    </button>
  );
}

/**
 * Which side of the screen the sidebar is on, Procreate's "Right-hand interface" preference, kept in `localStorage`.
 * Storage failures keep the choice for this session.
 */
function createInterfaceSide() {
  const [side, setSide] = createSignal<'left' | 'right'>(readSide());

  return [
    side,
    (next: 'left' | 'right') => {
      setSide(next);
      try {
        localStorage.setItem(sideKey, next);
      } catch {
        // Keep the choice for this session.
      }
    }
  ] as const;
}

function readSide(): 'left' | 'right' {
  try {
    return localStorage.getItem(sideKey) === 'right' ? 'right' : 'left';
  } catch {
    return 'left';
  }
}

const sideKey = 'paint.procreate.sidebar';

/** A brush size for display: tenths below 10 px, whole pixels above. */
function formatSize(size: number) {
  return size < 10 ? size.toFixed(1).replace(/\.0$/, '') : String(Math.round(size));
}
