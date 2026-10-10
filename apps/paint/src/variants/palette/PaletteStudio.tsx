import { NavigationPuck } from '@app-game/navigation-puck';
import { createEventListener } from '@solid-primitives/event-listener';
import type { JSX } from '@solidjs/web';
import { createEffect, createSignal, Errored, flush, For, Match, Show, Switch } from 'solid-js';
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
import { BrushList, createBrushRack } from './BrushRack';
import { createMixingPalette } from './createMixingPalette';
import { LayersList } from './LayersList';
import { MixingPalette } from './MixingPalette';
import styles from './PaletteStudio.module.css';

/**
 * The Palette variant: colors come from paint the user mixes, as on a painter's palette beside the canvas, not from a
 * color picker. A dock on the free hand's side (the right by default, for a left-handed painter; the menu swaps it)
 * holds the mixing palette with its paint tubes (see `MixingPalette`), the recently loaded colors, brush size and
 * opacity, and a short rack of brushes. Its top bar has undo, redo, the layers and the menu (files, export, view and
 * dock settings); the canvas keeps everything else off. The dock collapses to a strip with the loaded colors.
 *
 * Touching paint on the palette with the pen, or tapping it with a finger, loads the brush; with a Mixer Brush
 * preset the reservoir loads too. On the canvas, Alt-click or a held finger picks a color from the drawing; two- and
 * three-finger taps undo and redo.
 */
export function PaletteStudio(props: PaintVariantProps) {
  const [popover, setPopover] = createSignal<OpenPopover>();
  const session = createPaintSession({ panel: () => popover()?.id });
  const {
    library,
    tools,
    brush,
    tool,
    engine,
    ready,
    camera,
    mixer,
    uploads,
    presets,
    colorPicker,
    images,
    transform,
    fullscreen,
    chooseTool,
    edit
  } = session;
  const palette = createMixingPalette();
  const recentColors = createRecentColors();
  const rack = createBrushRack({ current: tools.preset, presets: library.presets, find: library.find });
  const dock = createDockSettings();
  // The rack shows the user's own and imported presets, which the library reads on demand.
  void library.loadAll();
  const [abrOpen, setAbrOpen] = createSignal(false);
  const [abrMounted, setAbrMounted] = createSignal(false);
  const [ui, setUi] = createSignal<HTMLElement>();
  let openFile!: HTMLInputElement;
  let insertImage!: HTMLInputElement;

  session.createShortcuts({
    closePanel() {
      if (!popover()) {
        return false;
      }

      setPopover(undefined);
      return true;
    }
  });

  // A press outside the open popover and its button closes it; on the canvas it does nothing else.
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
      if (target instanceof HTMLCanvasElement && !target.closest('[data-dock]')) {
        event.stopPropagation();
        event.preventDefault();
      }
    },
    { capture: true }
  );

  // Chrome's touch adjustment would move a finger's press off the palette and the tubes onto a nearby button.
  createEffect(ui, (element) => (element ? watchTapTargets(element) : undefined));

  /** Opens popover `id` beside `anchor`, or closes it when it is the one open. */
  function togglePopover(id: OpenPopover['id'], anchor: HTMLElement) {
    camera.navigation.close();
    if (id === 'library') {
      void library.loadAll();
    }

    setPopover(popover()?.id === id ? undefined : { id, anchor });
  }

  /**
   * Loads the brush with `color`, from the palette or the loaded colors: the brush tool paints with it next, and a
   * Mixer Brush preset fills its reservoir with it.
   */
  function loadBrush(color: string) {
    if (tool() !== 'brush') {
      chooseTool('brush');
    }

    tools.updateBrush({ color });
    recentColors.remember(color);
    // The Mixer Brush command reads the brush's color, written just now.
    flush();
    if (mixer.available()) {
      void mixer.command('load');
    }
  }

  function closeAnd(action: () => void) {
    setPopover(undefined);
    action();
  }

  /** Brush size and opacity can change: a painting tool is active and no stroke or upload is running. */
  const adjustable = () => session.paintsWithBrush() && !transform.active() && session.canChangeBrush();
  const brushSlot = () => (tool() === 'eraser' ? 'eraser' : 'brush');

  return (
    <PaintEditor
      session={session}
      class={[styles.editor, dock.collapsed() && styles.collapsed, dock.side() === 'left' && styles.left]
        .filter(Boolean)
        .join(' ')}
    >
      <PaintStage
        session={session}
        class={styles.stage}
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
            // A held finger picks a color from the drawing where it lifts.
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
      <div ref={setUi} class={styles.ui}>
        <aside class={styles.dock} data-dock aria-label="Palette and brushes">
          <header class={styles.bar}>
            <BarButton
              icon={dock.collapsed() === (dock.side() === 'right') ? 'left' : 'right'}
              label={dock.collapsed() ? 'Open the palette' : 'Collapse the palette'}
              onClick={() => {
                setPopover(undefined);
                dock.setCollapsed(!dock.collapsed());
              }}
            />
            <BarButton
              icon="undo"
              label="Undo · two-finger tap"
              disabled={!engine.state().canUndo || !ready()}
              onClick={() => session.undo()}
            />
            <BarButton
              icon="redo"
              label="Redo · three-finger tap"
              disabled={!engine.state().canRedo || !ready()}
              onClick={() => session.redo()}
            />
            <span class={styles.spacer} />
            <BarButton
              icon="layers"
              label="Layers"
              expanded={popover()?.id === 'layers'}
              onClick={(event) => togglePopover('layers', event.currentTarget)}
            />
            <BarButton
              icon="more"
              label="Menu: files, export, view"
              expanded={popover()?.id === 'menu'}
              onClick={(event) => togglePopover('menu', event.currentTarget)}
            />
          </header>
          <Show
            when={!dock.collapsed()}
            fallback={
              <LoadedColors
                current={brush().color}
                colors={recentColors.colors().slice(0, 8)}
                vertical
                onLoad={loadBrush}
              />
            }
          >
            <div class={styles.panels}>
              <Errored fallback={<p class={styles.failed}>The palette failed to open.</p>}>
                <MixingPalette palette={palette} color={brush().color} onLoad={loadBrush} />
              </Errored>
              <section class={styles.section} aria-label="Loaded colors">
                <LoadedColors current={brush().color} colors={recentColors.colors().slice(0, 7)} onLoad={loadBrush} />
                <Show when={mixer.available()}>
                  <div class={styles.mixer}>
                    <span>Mixer Brush loads from the palette</span>
                    <button disabled={!ready() || engine.commandBusy()} onClick={() => void mixer.command('clean')}>
                      Clean brush
                    </button>
                  </div>
                </Show>
              </section>
              <section class={[styles.section, styles.values]} aria-label="Brush size and opacity">
                <div class={styles.value}>
                  <span>Size</span>
                  <ScrubNumber
                    label="Brush size"
                    value={brush().size}
                    min={1}
                    max={maxBrushSize(brush())}
                    step={brush().size < 10 ? 0.1 : 1}
                    unit="px"
                    scale="log"
                    disabled={!adjustable() || session.blockCursor()}
                    onChange={(size) => tools.updateBrush({ size })}
                  />
                </div>
                <div class={styles.value}>
                  <span>Opacity</span>
                  <ScrubNumber
                    label="Brush opacity"
                    value={Math.round(brush().opacity * 100)}
                    min={1}
                    max={100}
                    unit="%"
                    disabled={!adjustable()}
                    onChange={(percent) => tools.updateBrush({ opacity: percent / 100 })}
                  />
                </div>
              </section>
              <section class={[styles.section, styles.rack]} aria-label="Brushes">
                <div class={styles.rackHeader}>
                  <div class={styles.segmented} role="radiogroup" aria-label="Tool">
                    <For each={['brush', 'eraser'] as const}>
                      {(slot) => (
                        <button
                          role="radio"
                          aria-checked={tool() === slot && !transform.active() ? 'true' : 'false'}
                          onClick={() => chooseTool(slot)}
                        >
                          <SketchIcon name={slot === 'brush' ? 'brush' : 'erase'} size={16} />
                          {slot === 'brush' ? 'Brush' : 'Eraser'}
                        </button>
                      )}
                    </For>
                  </div>
                  <button
                    class={styles.textButton}
                    aria-expanded={popover()?.id === 'library' ? 'true' : 'false'}
                    onClick={(event) => togglePopover('library', event.currentTarget)}
                  >
                    All brushes
                  </button>
                </div>
                <BrushList
                  presets={rack.presets()}
                  current={tools.preset()}
                  resources={library.resources}
                  disabled={!ready() || uploads.busy()}
                  onChoose={(id) => session.usePreset(id)}
                />
              </section>
            </div>
          </Show>
        </aside>
        <div class={styles.notices}>
          <SessionNotices session={session} />
        </div>
        <Show when={popover()} keyed>
          {(open) => (
            <DockPopover
              anchor={open.anchor}
              side={dock.side()}
              tall={open.id === 'library'}
              label={popoverLabels[open.id]}
            >
              <Errored fallback={<p class={styles.failed}>This panel failed to open.</p>}>
                <Switch>
                  <Match when={open.id === 'layers'}>
                    <LayersList
                      state={engine.state()}
                      ready={ready()}
                      onAction={(action) => edit({ type: 'layer', action })}
                    />
                  </Match>
                  <Match when={open.id === 'menu'}>
                    <div class={styles.menu} role="menu">
                      <MenuRow
                        label="Open a drawing…"
                        detail=".paint, .psd"
                        disabled={!ready()}
                        onClick={() => closeAnd(() => openFile.click())}
                      />
                      <MenuRow
                        label="Insert an image…"
                        detail="New layer"
                        disabled={!ready()}
                        onClick={() => closeAnd(() => insertImage.click())}
                      />
                      <MenuRow
                        label="Save the drawing"
                        detail=".paint"
                        disabled={!ready()}
                        onClick={() => closeAnd(() => edit({ type: 'download' }))}
                      />
                      <MenuRow
                        label="Export PNG"
                        detail="Visible canvas"
                        disabled={!ready()}
                        onClick={() => closeAnd(() => edit({ type: 'png' }))}
                      />
                      <MenuRow
                        label="Export PSD"
                        detail="Layers"
                        disabled={!ready()}
                        onClick={() => closeAnd(() => edit({ type: 'psd' }))}
                      />
                      <hr />
                      <MenuRow label="Reset the view" onClick={() => closeAnd(camera.reset)} />
                      <MenuRow label="Flip the view" checked={camera.camera().mirrored} onClick={camera.toggleMirror} />
                      <MenuRow
                        label="Palette on the left"
                        checked={dock.side() === 'left'}
                        onClick={() => closeAnd(() => dock.setSide(dock.side() === 'left' ? 'right' : 'left'))}
                      />
                      <Show when={document.fullscreenEnabled}>
                        <MenuRow
                          label="Full screen"
                          checked={fullscreen.isActive()}
                          onClick={() => void fullscreen.props.onClick()}
                        />
                      </Show>
                      <Show when={props.experimentsHref}>
                        {(href) => (
                          <>
                            <hr />
                            <a class={styles.menuRow} href={href()} role="menuitem">
                              <span>All experiments</span>
                            </a>
                          </>
                        )}
                      </Show>
                    </div>
                  </Match>
                  <Match when={open.id === 'library'}>
                    <div class={styles.library}>
                      <header class={styles.popoverHeader}>
                        <h2>All brushes</h2>
                        <button
                          class={styles.textButton}
                          onClick={() =>
                            closeAnd(() => {
                              setAbrMounted(true);
                              setAbrOpen(true);
                            })
                          }
                        >
                          Import ABR…
                        </button>
                      </header>
                      <div class={styles.libraryList}>
                        <BrushList
                          presets={library.presets()}
                          current={tools.preset()}
                          resources={library.resources}
                          disabled={!ready() || uploads.busy()}
                          onChoose={(id) => void session.choosePreset(id, brushSlot())}
                        />
                      </div>
                    </div>
                  </Match>
                </Switch>
              </Errored>
            </DockPopover>
          )}
        </Show>
      </div>
      <input
        ref={openFile}
        type="file"
        accept=".paint,.psd,application/json,image/vnd.adobe.photoshop"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) {
            edit({ type: 'import', file });
          }
        }}
      />
      <input
        ref={insertImage}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) {
            images.place(file);
          }
        }}
      />
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

/** The open popover and the button it opened from. */
type OpenPopover = { id: 'layers' | 'menu' | 'library'; anchor: HTMLElement };

const popoverLabels: Record<OpenPopover['id'], string> = {
  layers: 'Layers',
  menu: 'Menu',
  library: 'All brushes'
};

/**
 * The brush's color and the colors loaded lately, newest first; tapping one loads the brush with it again. In the
 * collapsed dock they stand in a column.
 */
function LoadedColors(props: {
  current: string;
  colors: readonly string[];
  vertical?: boolean;
  onLoad: (color: string) => void;
}) {
  return (
    <div class={styles.loaded} data-vertical={props.vertical ? 'true' : undefined}>
      <span class={styles.current} style={{ background: props.current }} title={`Brush color ${props.current}`} />
      <div class={styles.swatches} role="group" aria-label="Recently loaded colors">
        <For each={props.colors}>
          {(color) => (
            <button
              class={styles.swatch}
              style={{ background: color }}
              aria-label={`Load ${color}`}
              title={`Load ${color}`}
              onClick={() => props.onLoad(color)}
            />
          )}
        </For>
      </div>
    </div>
  );
}

/** An icon button of the dock's bar. */
function BarButton(props: {
  icon: SketchIconName;
  label: string;
  disabled?: boolean;
  /** The button's popover is open; omitted for buttons without one. */
  expanded?: boolean;
  onClick: JSX.EventHandler<HTMLButtonElement, MouseEvent>;
}) {
  return (
    <button
      class={styles.barButton}
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      aria-expanded={props.expanded === undefined ? undefined : props.expanded ? 'true' : 'false'}
      onClick={(event) => props.onClick(event)}
    >
      <SketchIcon name={props.icon} size={20} />
    </button>
  );
}

/** A row of the menu: a command, or a setting when `checked` is given. */
function MenuRow(props: {
  label: string;
  detail?: string;
  checked?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      class={styles.menuRow}
      role={props.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
      aria-checked={props.checked === undefined ? undefined : props.checked ? 'true' : 'false'}
      disabled={props.disabled}
      onClick={() => props.onClick()}
    >
      <span>{props.label}</span>
      <Show when={props.detail}>
        <small>{props.detail}</small>
      </Show>
      <Show when={props.checked !== undefined}>
        <i class={styles.check} />
      </Show>
    </button>
  );
}

/**
 * A panel beside the dock, on the canvas side, level with the button that opened it, or from the top when `tall`, for
 * long lists. It scrolls when taller than the room below its top.
 */
function DockPopover(props: {
  anchor: HTMLElement;
  side: 'left' | 'right';
  tall?: boolean;
  label: string;
  children: JSX.Element;
}) {
  const top = () => (props.tall ? margin : Math.max(margin, props.anchor.getBoundingClientRect().top));

  return (
    <div
      class={styles.popover}
      data-popover
      data-side={props.side}
      role="dialog"
      aria-label={props.label}
      style={{ top: `${top()}px`, 'max-height': `calc(100% - ${top() + margin}px)` }}
    >
      {props.children}
    </div>
  );
}

/** CSS pixels kept clear between popovers and the window's edges. */
const margin = 8;

/**
 * Where the dock is, kept in `localStorage`: on the right by default, the free hand's side for a left-handed
 * painter, and whether it is collapsed to a strip. Storage failures keep the choice for this session.
 */
function createDockSettings() {
  const stored = readDock();
  const [side, setSide] = createSignal<'left' | 'right'>(stored.side);
  const [collapsed, setCollapsed] = createSignal(stored.collapsed);
  const save = (next: { side: 'left' | 'right'; collapsed: boolean }) => {
    try {
      localStorage.setItem(dockKey, JSON.stringify(next));
    } catch {
      // Keep the choice for this session.
    }
  };

  return {
    side,
    collapsed,
    setSide(next: 'left' | 'right') {
      setSide(next);
      save({ side: next, collapsed: collapsed() });
    },
    setCollapsed(next: boolean) {
      setCollapsed(next);
      save({ side: side(), collapsed: next });
    }
  };
}

function readDock(): { side: 'left' | 'right'; collapsed: boolean } {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(dockKey) ?? '{}');
    const record = typeof stored === 'object' && stored !== null ? (stored as Record<string, unknown>) : {};
    return { side: record.side === 'left' ? 'left' : 'right', collapsed: record.collapsed === true };
  } catch {
    return { side: 'right', collapsed: false };
  }
}

const dockKey = 'paint.palette.dock';
