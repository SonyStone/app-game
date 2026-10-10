import { NavigationPuck } from '@app-game/navigation-puck';
import type { LayerAction } from '@app-game/paint-core/document';
import type { PaintSymmetry } from '@app-game/paint-core/symmetry';
import { createEventListener } from '@solid-primitives/event-listener';
import { createElementSize } from '@solid-primitives/resize-observer';
import type { JSX } from '@solidjs/web';
import { createEffect, createSignal, Errored, For, Match, onCleanup, Show, Switch, untrack } from 'solid-js';
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
import { ScrubNumber } from '../../shared/ui/ScrubNumber';
import { SketchIcon, type SketchIconName } from '../../shared/ui/SketchIcon';
import { watchTapTargets } from '../../shared/ui/watchTapTargets';
import { ArrivalCard } from './ArrivalCard';
import { Beside } from './Beside';
import { BrushPanel } from './BrushPanel';
import { ColorPanel } from './ColorPanel';
import { createGrowth } from './createGrowth';
import { createUsageWatch } from './createUsageWatch';
import styles from './GrowingStudio.module.css';
import { features } from './growth';
import { GrowthMenu } from './GrowthMenu';
import { arrivalHints } from './hints';
import { LayersPanel } from './LayersPanel';
import panelStyles from './panels.module.css';
import { SelectionOptions } from './SelectionOptions';
import { SymmetryPanel } from './SymmetryPanel';

/**
 * The Growing variant: progressive disclosure as the whole design. A new user sees one small dock with a brush, an
 * eraser, undo and redo, and the dock grows as they reach for more: colors after a few strokes, the color disc after
 * a few color changes, size and opacity, the brush library, layers after much drawing or erasing, then blending,
 * selection, transform, fill, gradient, symmetry, the view controls once they zoom or pan, and the file commands
 * (see `growth.ts` for the rules). A tool's keyboard shortcut grows it at once, and the menu lists what is still to
 * come with a button to ask for it. Each control slides in at its own place in the dock, so nothing reshuffles, with
 * a one-line card beside it; the menu has "Show everything" and "Start fresh". Growth persists in `localStorage`.
 *
 * The dock stands on the side of the free hand (the right for a left-handed user, the default), so that the palm of
 * the pen hand does not touch it. Panels open beside the dock; a press on the drawing closes them and draws. Touch:
 * two fingers tap to undo, three to redo, and a held finger picks a color.
 */
export function GrowingStudio(props: PaintVariantProps) {
  const [panel, setPanel] = createSignal<Panel>();
  const session = createPaintSession({ panel: () => panel() });
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
    transform,
    fullscreen,
    chooseTool,
    toggleTransform,
    choosePreset,
    edit
  } = session;
  const growth = createGrowth();
  const usage = createUsageWatch(session, growth);
  const recentColors = createRecentColors();
  const [ui, setUi] = createSignal<HTMLElement>();
  const [dock, setDock] = createSignal<HTMLElement>();
  const dockSize = createElementSize(dock);
  const [abrOpen, setAbrOpen] = createSignal(false);
  const [abrMounted, setAbrMounted] = createSignal(false);
  /** Controls slide in only once the dock has settled, not when the stored growth first renders. */
  const [settled, setSettled] = createSignal(false);
  const settle = setTimeout(() => setSettled(true), 800);
  onCleanup(() => clearTimeout(settle));
  /**
   * Marks a dock control mounted after the dock settled, so that it slides in. Set once from its ref: as an attribute,
   * it would be evaluated again whenever another attribute of the element changes, and replay the animation.
   */
  const markArrival = (element: HTMLElement) => {
    if (untrack(settled)) {
      element.dataset.arriving = '';
    }
  };
  /** The dock stands on the side of the hand without the pen. */
  const dockSide = () => (growth.hand() === 'left' ? 'right' : 'left');
  /** The pointer over the drawing in client pixels, for the arrival card to give way to. */
  const pointer = () => {
    const point = session.cursor();
    const stage = session.stage()?.getBoundingClientRect();
    return point && stage && { x: point.x + stage.left, y: point.y + stage.top };
  };

  session.createShortcuts({
    closePanel() {
      if (!panel()) {
        return false;
      }

      setPanel(undefined);
      return true;
    }
  });

  // A press outside the open panel and its control closes the panel; on the drawing it goes on to draw. A press on
  // a control means it was found: its arrival card, shown or still waiting, is done.
  createEventListener(
    document,
    'pointerdown',
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const open = panel();
      if (open && !target.closest('[data-growing-panel]') && !target.closest(`[data-anchor="${panelAnchors[open]}"]`)) {
        setPanel(undefined);
      }

      for (const feature of features) {
        if (growth.has(feature) && target.closest(`[data-anchor="${arrivalHints[feature].anchor}"]`)) {
          growth.dismiss(feature);
        }
      }
    },
    { capture: true }
  );

  // The welcome has said its piece once the user draws.
  createEffect(
    () => growth.usage().strokes >= 3,
    (drawn) => {
      if (drawn) {
        growth.dismiss('welcome');
      }
    }
  );

  // Chrome's touch adjustment would move a finger's press off the disc and the number fields onto a nearby button.
  createEffect(ui, (element) => (element ? watchTapTargets(element) : undefined));

  /** Opens panel `id`, or closes it when it is the one open. */
  function togglePanel(id: Panel) {
    camera.navigation.close();
    setPanel(panel() === id ? undefined : id);
  }

  /**
   * The brush and the eraser: a tap chooses the tool; a tap on the active tool asks for more, which counts toward the
   * brush library and, once it has grown, opens it.
   */
  function chooseBrushTool(slot: 'brush' | 'eraser') {
    if (tool() !== slot || transform.active()) {
      setPanel(undefined);
      chooseTool(slot);
      return;
    }

    if (!growth.has('brushes')) {
      growth.count('brushTaps');
      return;
    }

    void library.loadAll();
    togglePanel(slot);
  }

  /** The current color in the dock: opens the color disc, growing it at once when the user reaches for it. */
  function openColors() {
    growth.request(['colorDisc']);
    togglePanel('colors');
  }

  function chooseColor(hex: string) {
    tools.updateBrush({ color: hex });
    recentColors.remember(hex);
  }

  function runLayerAction(action: LayerAction) {
    growth.count('layerActions');
    edit({ type: 'layer', action });
  }

  function toggleEyedropper() {
    setPanel(undefined);
    if (colorPicker.armed()) {
      colorPicker.cancel();
      return;
    }

    colorPicker.arm();
  }

  /** Selection on, or back to the last brush tool while it or a tool working in the selection is active. */
  function toggleSelection() {
    setPanel(undefined);
    chooseTool(session.selectionTool() ? tools.slot() : 'lasso');
  }

  /** The fill and the gradient work inside the selection; choosing one again returns to the selection tool. */
  function toggleSelectionTool(next: 'fill' | 'gradient') {
    setPanel(undefined);
    chooseTool(tool() === next ? 'lasso' : next);
  }

  function setSymmetry(mode: PaintSymmetry['mode']) {
    const current = symmetry.symmetry();
    // A guide turned on starts at the center of the view.
    const center = current.mode === 'off' ? { x: camera.camera().x, y: camera.camera().y } : {};
    symmetry.update({ ...current, ...center, mode });
  }

  function openAbrViewer() {
    setPanel(undefined);
    setAbrMounted(true);
    setAbrOpen(true);
  }

  /** The selection's options show beside the dock while a tool working with the selection is active. */
  const selectionOptions = () => session.selectionTool() !== undefined && !transform.active() && !panel();
  /** Brush size and opacity can change: a painting tool is active and no stroke or upload is running. */
  const adjustable = () => session.paintsWithBrush() && !transform.active() && session.canChangeBrush();

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
            },
            // Touch and hold: the eyedropper follows the finger and picks the color where it lifts.
            hold(point) {
              if (!ready() || transform.active()) {
                return;
              }

              usage.skipTouches();
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
      <div ref={setUi} class={styles.ui}>
        <Errored fallback={<p class={styles.failed}>The dock failed to open.</p>}>
          <nav ref={setDock} class={styles.dock} data-side={dockSide()} aria-label="Tools">
            <button
              class={styles.menuButton}
              data-anchor="menu"
              aria-label="Menu"
              title="Menu · show everything, start fresh, files"
              aria-expanded={panel() === 'menu' ? 'true' : 'false'}
              onClick={() => togglePanel('menu')}
            >
              <SketchIcon name="more" size={18} />
            </button>
            <div class={styles.group} data-anchor="history">
              <DockButton
                label="Undo"
                title="Undo · two-finger tap · Ctrl+Z"
                icon="undo"
                disabled={!engine.state().canUndo || !ready()}
                onClick={() => session.undo()}
              />
              <DockButton
                label="Redo"
                title="Redo · three-finger tap · Ctrl+Shift+Z"
                icon="redo"
                disabled={!engine.state().canRedo || !ready()}
                onClick={() => session.redo()}
              />
            </div>
            <div class={styles.group} data-anchor="paint">
              <DockButton
                label="Brush"
                title={growth.has('brushes') ? 'Brush · B · tap again for brushes' : 'Brush · B'}
                icon="brush"
                pressed={tool() === 'brush' && !transform.active()}
                expanded={growth.has('brushes') ? panel() === 'brush' : undefined}
                onClick={() => chooseBrushTool('brush')}
              />
              <DockButton
                label="Eraser"
                title={growth.has('brushes') ? 'Eraser · E · tap again for brushes' : 'Eraser · E'}
                icon="erase"
                pressed={tool() === 'eraser' && !transform.active()}
                expanded={growth.has('brushes') ? panel() === 'eraser' : undefined}
                onClick={() => chooseBrushTool('eraser')}
              />
            </div>
            <Show when={growth.has('swatches')}>
              <div class={styles.group} data-anchor="colors" ref={markArrival}>
                <button
                  class={styles.current}
                  aria-label="Color disc"
                  title="Current color · tap for the color disc"
                  aria-expanded={panel() === 'colors' ? 'true' : 'false'}
                  onClick={openColors}
                >
                  <span class={styles.secondary} style={{ background: brush().backgroundColor ?? '#ffffff' }} />
                  <span class={styles.primary} style={{ background: brush().color }} />
                </button>
                <DockButton
                  label="Eyedropper"
                  title="Eyedropper · then tap the drawing; or hold a finger on it"
                  icon="picker"
                  pressed={colorPicker.armed()}
                  onClick={toggleEyedropper}
                />
                <div class={styles.swatches} role="group" aria-label="Swatches">
                  <For each={swatches}>
                    {(hex) => (
                      <button
                        class={styles.swatch}
                        data-current={hex === brush().color ? '' : undefined}
                        style={{ background: hex }}
                        aria-label={hex}
                        title={hex}
                        onClick={() => chooseColor(hex)}
                      />
                    )}
                  </For>
                </div>
              </div>
            </Show>
            <Show when={growth.has('size')}>
              <div class={styles.group} data-anchor="size" ref={markArrival}>
                <div class={styles.number} title="Brush size · [ and ]">
                  <ScrubNumber
                    label="Brush size"
                    value={brush().size}
                    min={1}
                    max={maxBrushSize(brush())}
                    scale="log"
                    unit="px"
                    disabled={!adjustable() || session.blockCursor()}
                    onInput={(size) => tools.updateBrush({ size })}
                    onChange={(size) => tools.updateBrush({ size })}
                  />
                </div>
                <div class={styles.number} title="Brush opacity">
                  <ScrubNumber
                    label="Brush opacity"
                    value={Math.round(brush().opacity * 100)}
                    min={1}
                    max={100}
                    unit="%"
                    disabled={!adjustable()}
                    onInput={(percent) => tools.updateBrush({ opacity: percent / 100 })}
                    onChange={(percent) => tools.updateBrush({ opacity: percent / 100 })}
                  />
                </div>
              </div>
            </Show>
            <Show when={growth.has('layers')}>
              <div class={styles.group} data-anchor="layers" ref={markArrival}>
                <DockButton
                  label="Layers"
                  title="Layers"
                  icon="layers"
                  badge={String(engine.state().layers.length)}
                  expanded={panel() === 'layers'}
                  onClick={() => togglePanel('layers')}
                />
                <DockButton
                  label="New layer"
                  title="New layer above the active one"
                  icon="newLayer"
                  disabled={!ready()}
                  onClick={() => runLayerAction({ type: 'add' })}
                />
              </div>
            </Show>
            <Show
              when={
                growth.has('selection') ||
                growth.has('transform') ||
                growth.has('fill') ||
                growth.has('gradient') ||
                growth.has('symmetry')
              }
            >
              <div class={styles.group} data-anchor="tools" ref={markArrival}>
                <Show when={growth.has('selection')}>
                  <DockButton
                    anchor="tool-selection"
                    mark={markArrival}
                    label="Selection"
                    title="Selection · L"
                    icon="lasso"
                    pressed={tool() === 'lasso' && !transform.active()}
                    onClick={toggleSelection}
                  />
                </Show>
                <Show when={growth.has('transform')}>
                  <DockButton
                    anchor="tool-transform"
                    mark={markArrival}
                    label="Transform"
                    title="Transform · Ctrl+T"
                    icon="move"
                    pressed={transform.active()}
                    onClick={() => {
                      setPanel(undefined);
                      toggleTransform();
                    }}
                  />
                </Show>
                <Show when={growth.has('fill')}>
                  <DockButton
                    anchor="tool-fill"
                    mark={markArrival}
                    label="Fill"
                    title={selection.selected() ? 'Fill the selection · G' : 'Fill · select an area first'}
                    icon="fill"
                    pressed={tool() === 'fill' && !transform.active()}
                    disabled={!selection.selected() && tool() !== 'fill'}
                    onClick={() => toggleSelectionTool('fill')}
                  />
                </Show>
                <Show when={growth.has('gradient')}>
                  <DockButton
                    anchor="tool-gradient"
                    mark={markArrival}
                    label="Gradient"
                    title={selection.selected() ? 'Gradient in the selection' : 'Gradient · select an area first'}
                    icon="gradient"
                    pressed={tool() === 'gradient' && !transform.active()}
                    disabled={!selection.selected() && tool() !== 'gradient'}
                    onClick={() => toggleSelectionTool('gradient')}
                  />
                </Show>
                <Show when={growth.has('symmetry')}>
                  <DockButton
                    anchor="tool-symmetry"
                    mark={markArrival}
                    label="Symmetry"
                    title="Symmetry"
                    icon="symmetry"
                    pressed={symmetry.symmetry().mode !== 'off'}
                    expanded={panel() === 'symmetry'}
                    onClick={() => togglePanel('symmetry')}
                  />
                </Show>
              </div>
            </Show>
            <Show when={growth.has('view')}>
              <div class={styles.group} data-anchor="view" ref={markArrival}>
                <button
                  class={styles.zoom}
                  title="Zoom · tap for 100 % · Ctrl+0"
                  aria-label={`Zoom ${Math.round(camera.camera().zoom * 100)} %, tap for 100 %`}
                  onClick={() => camera.resetZoom()}
                >
                  {Math.round(camera.camera().zoom * 100)} %
                </button>
                <DockButton
                  label="Flip the view"
                  title="Flip the view"
                  icon="mirror"
                  pressed={camera.camera().mirrored}
                  onClick={() => camera.toggleMirror()}
                />
                <DockButton
                  label="Reset the view"
                  title="Reset the view: 100 %, unturned, unflipped"
                  icon="home"
                  onClick={() => camera.reset()}
                />
              </div>
            </Show>
          </nav>
        </Errored>
        <Show when={selectionOptions()}>
          <Beside
            dock={dock()}
            anchor="tools"
            dockSide={dockSide()}
            dockSize={dockSize}
            class={panelStyles.gridCard}
            role="toolbar"
            label="Selection"
          >
            <SelectionOptions
              tool={selection.tool()}
              onTool={selection.setTool}
              mode={selection.mode()}
              onMode={selection.setMode}
              selected={selection.selected() && !selection.drawing()}
              disabled={!ready() || selection.drawing() || selection.busy()}
              onSelectAll={selection.selectAll}
              onInvert={selection.invert}
              onClear={selection.clear}
            />
          </Beside>
        </Show>
        <Show when={panel()} keyed>
          {(open) => (
            <Errored fallback={<p class={styles.failed}>This panel failed to open.</p>}>
              <Beside
                dock={dock()}
                anchor={panelAnchors[open]}
                dockSide={dockSide()}
                dockSize={dockSize}
                class={panelStyles.panel}
                style={{ width: `${panelWidths[open]}px` }}
                role="dialog"
                label={panelLabels[open]}
                panel
              >
                <Switch>
                  <Match when={open === 'menu'}>
                    <GrowthMenu
                      growth={growth}
                      ready={ready()}
                      fullscreen={{
                        active: fullscreen.isActive(),
                        supported: document.fullscreenEnabled,
                        toggle: () => void fullscreen.props.onClick()
                      }}
                      onOpen={(file) => {
                        setPanel(undefined);
                        edit({ type: 'import', file });
                      }}
                      onInsertImage={(file) => {
                        setPanel(undefined);
                        images.place(file);
                      }}
                      onSave={() => {
                        setPanel(undefined);
                        edit({ type: 'download' });
                      }}
                      onExportPng={() => {
                        setPanel(undefined);
                        edit({ type: 'png' });
                      }}
                      onExportPsd={() => {
                        setPanel(undefined);
                        edit({ type: 'psd' });
                      }}
                      experimentsHref={props.experimentsHref}
                      onDone={() => setPanel(undefined)}
                    />
                  </Match>
                  <Match when={open === 'colors'}>
                    <ColorPanel
                      color={brush().color}
                      secondary={brush().backgroundColor ?? '#ffffff'}
                      recent={recentColors.colors()}
                      onColor={(color) => tools.updateBrush({ color })}
                      onCommit={recentColors.remember}
                      onSwap={tools.swapColors}
                      onDone={() => setPanel(undefined)}
                    />
                  </Match>
                  <Match when={open === 'brush' || open === 'eraser'}>
                    <BrushPanel
                      title={open === 'eraser' ? 'Eraser' : 'Brushes'}
                      presets={library.presets()}
                      preset={open === 'eraser' && tools.eraserMode() === 'clear' ? undefined : tools.preset()}
                      disabled={!ready() || uploads.busy()}
                      onChoose={(id) => {
                        setPanel(undefined);
                        void choosePreset(id, open === 'eraser' ? 'eraser' : 'brush');
                      }}
                      onImport={openAbrViewer}
                      eraseWithBrush={
                        open === 'eraser'
                          ? {
                              on: tools.eraserMode() === 'clear' && tools.canClear(),
                              available: tools.canClear(),
                              onToggle: () => tools.setEraserMode(tools.eraserMode() === 'clear' ? 'preset' : 'clear')
                            }
                          : undefined
                      }
                    />
                  </Match>
                  <Match when={open === 'layers'}>
                    <LayersPanel
                      state={engine.state()}
                      ready={ready()}
                      blending={growth.has('layerBlend')}
                      onAction={runLayerAction}
                    />
                  </Match>
                  <Match when={open === 'symmetry'}>
                    <SymmetryPanel
                      symmetry={symmetry.symmetry()}
                      disabled={!session.canUpdateSymmetry()}
                      onMode={setSymmetry}
                      onSegments={(segments) => symmetry.update({ ...symmetry.symmetry(), segments })}
                    />
                  </Match>
                </Switch>
              </Beside>
            </Errored>
          )}
        </Show>
        {/* A card waits while a panel or the selection's options stand beside the dock. */}
        <Show when={!panel() && !selectionOptions() && growth.hint()} keyed>
          {(hint) => (
            <ArrivalCard
              hint={arrivalHints[hint]}
              dock={dock()}
              dockSide={dockSide()}
              dockSize={dockSize}
              pointer={pointer()}
              onAction={() => runLayerAction({ type: 'add' })}
              onDismiss={() => growth.dismiss(hint)}
            />
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

/** The panel open beside the dock. */
type Panel = 'menu' | 'colors' | 'brush' | 'eraser' | 'layers' | 'symmetry';

/** The dock control each panel comes out of (its `data-anchor`). */
const panelAnchors: Record<Panel, string> = {
  menu: 'menu',
  colors: 'colors',
  brush: 'paint',
  eraser: 'paint',
  layers: 'layers',
  symmetry: 'tool-symmetry'
};

const panelWidths: Record<Panel, number> = {
  menu: 272,
  colors: 232,
  brush: 260,
  eraser: 260,
  layers: 264,
  symmetry: 200
};

const panelLabels: Record<Panel, string> = {
  menu: 'Menu',
  colors: 'Color',
  brush: 'Brushes',
  eraser: 'Eraser',
  layers: 'Layers',
  symmetry: 'Symmetry'
};

/** The swatches in the dock: neutrals, then earthy and muted hues, as a starting palette for sketching. */
const swatches = ['#111111', '#7a7a7a', '#ffffff', '#a7795a', '#c4463a', '#e6b93d', '#3d8a7a', '#3d6a8c'] as const;

/**
 * An icon button of the dock: `pressed` for the active tool, `expanded` for a button with a panel, a small corner mark
 * when `expanded` is given (it opens something), and `badge` for a count such as the number of layers. `anchor`
 * marks it for arrival cards and panels.
 */
function DockButton(props: {
  label: string;
  title: string;
  icon: SketchIconName;
  pressed?: boolean;
  expanded?: boolean;
  disabled?: boolean;
  badge?: string;
  anchor?: string;
  /** Called with the button once it is created, such as to mark its arrival; see `markArrival`. */
  mark?: (element: HTMLElement) => void;
  onClick: JSX.EventHandler<HTMLButtonElement, MouseEvent>;
}) {
  return (
    <button
      class={styles.button}
      data-anchor={props.anchor}
      ref={(element) => props.mark?.(element)}
      aria-label={props.label}
      title={props.title}
      aria-pressed={props.pressed === undefined ? undefined : props.pressed ? 'true' : 'false'}
      aria-expanded={props.expanded === undefined ? undefined : props.expanded ? 'true' : 'false'}
      disabled={props.disabled}
      onClick={(event) => props.onClick(event)}
    >
      <SketchIcon name={props.icon} size={20} />
      <Show when={props.badge}>{(badge) => <span class={styles.badge}>{badge()}</span>}</Show>
    </button>
  );
}
