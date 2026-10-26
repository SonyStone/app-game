import { NavigationPuck } from '@app-game/navigation-puck';
import { defaultCamera, screenToWorld } from '@app-game/paint-core/camera';
import { encodeDocument, snapshotDocument } from '@app-game/paint-core/storage';
import { createEventListener } from '@solid-primitives/event-listener';
import { createEffect, createSignal, Errored, For, Match, onSettled, Show, Switch, untrack } from 'solid-js';
import type { PaintVariantProps } from '..';
import { AbrViewerDialog } from '../../features/abr';
import { maxBrushSize } from '../../features/brush';
import { hexToHsv, hsvToHex, type Hsv } from '../../features/color/hsv';
import { mergeSimilar } from '../../features/color/mergeSimilar';
import {
  createPaintSession,
  PaintEditor,
  PaintStage,
  SessionNotices,
  StageGuides,
  StageOverlays
} from '../../features/session';
import { watchTapTargets } from '../../shared/ui/watchTapTargets';
import { geometricFraction, geometricValue } from '../procreate/sliderScale';
import { Anchored } from './Anchored';
import { BrushOpacityPopup, BrushSizePopup, type OpacityTarget } from './BrushPopups';
import { BrushSelector } from './BrushSelector';
import { ColorPanel } from './ColorPanel';
import { createBrushFavorites } from './createBrushFavorites';
import { createCustomToolbar, createDockDrag } from './createCustomToolbar';
import { createInfiniteColorSettings } from './createInfiniteColorSettings';
import { createToolActions } from './createToolActions';
import { HistoryControls } from './HistoryControls';
import { InfiniteIcon } from './icons';
import styles from './InfiniteStudio.module.css';
import { LayerPanel, layerPanelWidths } from './LayerPanel';
import { MainToolbar, toolbarWidth, type ToolbarMode, type ToolbarReadout } from './MainToolbar';
import { OptionsMenu } from './OptionsMenu';
import { Readout } from './Readout';
import { historyLimit, RecentColorsStrip } from './RecentColorsStrip';
import theme from './theme.module.css';
import { creativeTools, editingTools, findTool } from './toolCatalog';
import { MiniBarButton, ToolMiniBars, type MiniBar } from './ToolMiniBars';
import { ToolsMenu } from './ToolsMenu';
import { TopBar, type TopBarMenu } from './TopBar';

/**
 * The Infinite Painter variant: a close copy of Infinite Painter 7.1 for Android on Paint's engine, after its
 * reference manual. Only what is needed at the moment shows over the drawing:
 *
 * - the top bar's icons: Home, the Selection menu while a selection exists, the custom toolbar's docked icons, the
 *   Creative and Editing Tools menus, the Layer panel toggle and the Options menu;
 * - the main toolbar, which two fingers move: the brush modes (a tap on the active one opens the brush selector),
 *   the Size, Color and Opacity buttons that slide on a drag and open their pop-ups on a tap, a drag out of Color
 *   for the eyedropper, and the Recent Colors strip;
 * - the layer panel at the right edge, a column of layer thumbnails that a slide expands;
 * - Undo, Redo and the undo history slider at the bottom-left, and the on-screen readout while a value changes.
 *
 * Touch: two fingers tap to undo, three to redo, four hide the interface; a held finger picks a color; pinch, twist
 * and drag move the view. One menu or pop-up is open at a time, and a press outside it closes it without painting.
 * Entries of Infinite Painter's menus that Paint lacks are shown disabled, as a copy shows what the original has.
 */
export function InfiniteStudio(props: PaintVariantProps) {
  const [popup, setPopup] = createSignal<OpenPopup>();
  const session = createPaintSession({ panel: () => popup()?.id });
  const { tools, brush, tool, engine, ready, camera, colorPicker, selection, transform, presets, mixer } = session;

  const [hidden, setHidden] = createSignal(false);
  const [layersOpen, setLayersOpen] = createStoredSignal('paint.infinite.layers', true);
  const [layersExpanded, setLayersExpanded] = createStoredSignal('paint.infinite.layersExpanded', false);
  const [toolbarAt, setToolbarAt] = createStoredSignal('paint.infinite.toolbarAt', { x: 8, y: 0.22 });
  const [readout, setReadout] = createSignal<ToolbarReadout>();
  const [abrOpen, setAbrOpen] = createSignal(false);
  const [abrMounted, setAbrMounted] = createSignal(false);
  const [ui, setUi] = createSignal<HTMLElement>();
  let drawingInput!: HTMLInputElement;
  let imageInput!: HTMLInputElement;

  const actions = createToolActions(session, {
    newDrawing,
    openDrawing: () => drawingInput.click(),
    importImage: () => imageInput.click(),
    save: () => session.edit({ type: 'download' }),
    settings: () => session.windows.open('pen')
  });
  const colorSettings = createInfiniteColorSettings();
  const [colorHistory, setColorHistory] = createStoredSignal<string[]>('paint.infinite.recentColors', []);
  /** The color before the color panel opened, which the panel shows beside the current one and restores on a tap. */
  const [previousColor, setPreviousColor] = createSignal(untrack(() => brush().color));
  const customToolbar = createCustomToolbar();
  const favorites = createBrushFavorites();
  const [dockArea, setDockArea] = createSignal<HTMLElement>();
  const dockDrag = createDockDrag({ drop: dropOnDock });

  session.createShortcuts({
    closePanel() {
      if (!popup()) {
        return false;
      }

      setPopup(undefined);
      return true;
    }
  });

  // A press outside the open menu or pop-up and the button that opened it closes it; on the canvas it only closes it,
  // so the press neither paints nor navigates.
  createEventListener(
    document,
    'pointerdown',
    (event) => {
      const open = popup();
      const target = event.target;
      if (!open || !(target instanceof Element) || target.closest('[data-popover]') || open.anchor.contains(target)) {
        return;
      }

      setPopup(undefined);
      if (target instanceof HTMLCanvasElement) {
        event.stopPropagation();
        event.preventDefault();
      }
    },
    { capture: true }
  );

  // Chrome's touch adjustment would move a finger's press off the toolbar's sliders onto a nearby button.
  createEffect(ui, (element) => (element ? watchTapTargets(element) : undefined));

  // The color history takes a color once it has settled for a moment, wherever it came from: the panel, a slide of
  // the Color button, the eyedropper or a swatch. Near duplicates merge, as in Infinite Painter.
  createEffect(
    () => brush().color,
    (color) => {
      const timer = setTimeout(() => {
        setColorHistory(mergeSimilar(untrack(colorHistory), color).slice(0, historyLimit));
      }, historySettleMs);
      return () => clearTimeout(timer);
    }
  );

  /** Opens menu or pop-up `id` from `anchor`, or closes it when it is the one open. */
  function togglePopup(id: OpenPopup['id'], anchor: HTMLElement) {
    camera.navigation.close();
    if (id === 'color' && popup()?.id !== 'color') {
      setPreviousColor(brush().color);
    }

    setPopup(popup()?.id === id ? undefined : { id, anchor });
  }

  function runEntry(id: string) {
    setPopup(undefined);
    actions.run(id);
  }

  /** Replaces the drawing with a blank one after asking, as Infinite Painter's New closes the project. */
  function newDrawing() {
    if (!confirm('Start a new drawing? The current one is replaced; undo cannot bring it back.')) {
      return;
    }

    session.edit({ type: 'import', text: blankDrawing() });
  }

  /** A dragged icon lands: on the custom toolbar's area it docks at the slot under the pointer, elsewhere it leaves. */
  function dropOnDock(drag: { id: string; from: 'menu' | 'dock' }, point: { x: number; y: number }) {
    const slot = dockSlotAt(point);
    if (slot !== undefined) {
      customToolbar.dock(drag.id, slot);
      return;
    }

    if (drag.from === 'dock') {
      customToolbar.undock(drag.id);
    }
  }

  /** The custom toolbar's slot under client point `point`, or `undefined` off its area. */
  function dockSlotAt(point: { x: number; y: number }) {
    const area = dockArea();
    const rect = area?.getBoundingClientRect();
    if (
      !area ||
      !rect ||
      point.y < rect.top - 16 ||
      point.y > rect.bottom + 24 ||
      point.x < rect.left ||
      point.x > rect.right
    ) {
      return undefined;
    }

    const icons = [...area.querySelectorAll('button')];
    const after = icons.findIndex((icon) => {
      const box = icon.getBoundingClientRect();
      return point.x < box.left + box.width / 2;
    });
    return after === -1 ? icons.length : after;
  }

  const mode = (): ToolbarMode | undefined =>
    transform.active() ? undefined : tool() === 'brush' ? 'brush' : tool() === 'eraser' ? 'eraser' : undefined;
  const adjustable = () => session.paintsWithBrush() && !transform.active() && session.canChangeBrush();
  const maxSize = () => maxBrushSize(brush());

  const [opacityTarget, setOpacityTarget] = createStoredSignal<OpacityTarget>(
    'paint.infinite.opacityTarget',
    'opacity'
  );
  const opacityValue = () => {
    const target = opacityTarget();
    return target === 'flow' ? brush().flow : target === 'softness' ? 1 - brush().hardness : brush().opacity;
  };
  const setOpacityValue = (value: number) => {
    const target = opacityTarget();
    tools.updateBrush(
      target === 'flow' ? { flow: value } : target === 'softness' ? { hardness: 1 - value } : { opacity: value }
    );
  };

  // The color's hue and saturation survive black and white: Infinite Painter's brightness drag keeps the hue.
  let hsv: Hsv = hexToHsv(untrack(() => brush().color));
  const currentHsv = () => {
    hsv = hexToHsv(brush().color, hsv);
    return hsv;
  };
  /** The hue and saturation a brightness drag keeps, from its start. */
  let brightnessBase: Hsv | undefined;
  const setBrightness = (value: number, done: boolean) => {
    brightnessBase ??= currentHsv();
    hsv = { ...brightnessBase, v: value };
    tools.updateBrush({ color: hsvToHex(hsv) });
    if (done) {
      brightnessBase = undefined;
    }
  };

  /** The eyedropper dragged out of the Color button: client points become the canvas picker's document points. */
  function eyedropper(phase: 'start' | 'move' | 'end' | 'cancel', point: { x: number; y: number }) {
    const stage = session.stage();
    if (!stage || !ready()) {
      return;
    }

    if (phase === 'cancel' || phase === 'end') {
      colorPicker.canvasAction.end?.(phase === 'cancel');
      return;
    }

    const rect = stage.getBoundingClientRect();
    const world = screenToWorld({ x: point.x - rect.left, y: point.y - rect.top }, camera.current(), session.size());
    if (phase === 'start') {
      setPopup(undefined);
      colorPicker.canvasAction.run(world);
      return;
    }

    colorPicker.canvasAction.move(world);
  }

  const readoutView = () => {
    const current = readout();
    if (!current) {
      return undefined;
    }

    if (current.kind === 'size') {
      const zoom = camera.camera().zoom;
      return {
        text: `Size: ${formatSize(brush().size)} px`,
        ring: { current: brush().size * zoom, max: maxSize() * zoom },
        color: brush().color
      };
    }

    if (current.kind === 'brightness') {
      return { text: `Brightness: ${Math.round(currentHsv().v * 100)} %` };
    }

    return { text: `${opacityLabels[opacityTarget()]}: ${Math.round(opacityValue() * 100)} %` };
  };

  /** The mini-toolbars of the tools that are on, in the order Infinite Painter stacks them. */
  const miniBars = (): MiniBar[] => {
    if (transform.active()) {
      return [
        {
          id: 'transform',
          label: 'Transform',
          icon: 'move',
          onClose: () => void transform.cancel(),
          controls: (
            <>
              <MiniBarButton label="Cancel" onClick={() => void transform.cancel()} />
              <MiniBarButton label="Apply" onClick={() => void transform.end()} />
            </>
          )
        }
      ];
    }

    return miniBarTools.flatMap((id) => {
      const entry = findTool(id);
      if (!entry || !actions.active(id)) {
        return [];
      }

      const selecting = id.startsWith('select-');
      return {
        id,
        label: entry.label,
        icon: entry.icon,
        onClose: () => actions.run(id),
        controls: selecting ? (
          <>
            <MiniBarButton
              label="Add"
              pressed={selection.mode() === 'add'}
              onClick={() => selection.setMode(selection.mode() === 'add' ? 'replace' : 'add')}
            />
            <MiniBarButton
              label="Subtract"
              pressed={selection.mode() === 'subtract'}
              onClick={() => selection.setMode(selection.mode() === 'subtract' ? 'replace' : 'subtract')}
            />
          </>
        ) : undefined
      };
    });
  };

  const historyIndex = () => {
    const state = engine.state();
    return Math.max(
      0,
      state.historyStates.findIndex((entry) => entry.id === state.historyCurrentId)
    );
  };

  const toolbarPosition = () => {
    const at = toolbarAt();
    return { x: at.x, y: Math.round(at.y * innerHeight) };
  };

  return (
    <PaintEditor session={session} class={[theme.theme, styles.editor].join(' ')}>
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
                setPopup(undefined);
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

      <div ref={setUi} class={styles.ui}>
        <Show
          when={!hidden()}
          fallback={
            <button
              class={[theme.iconButton, styles.showInterface]}
              aria-label="Show the interface"
              onClick={() => setHidden(false)}
            >
              <InfiniteIcon name="close" size={18} />
            </button>
          }
        >
          <TopBar
            homeHref={props.experimentsHref}
            open={topBarMenu(popup()?.id)}
            onMenu={(menu, anchor) => togglePopup(menu, anchor)}
            layersOpen={layersOpen()}
            onLayers={() => {
              setPopup(undefined);
              setLayersOpen(!layersOpen());
            }}
            selection={selection.selected()}
            docked={customToolbar.ids().flatMap((id) => findTool(id) ?? [])}
            available={actions.available}
            active={actions.active}
            onRun={runEntry}
            onDockDragStart={(id, point, pointerId) => dockDrag.start(id, 'dock', point, pointerId)}
            dockArea={setDockArea}
            dropSlot={dockDrag.drag() && dockSlotAt(dockDrag.drag()!.at)}
          />

          <Errored fallback={null}>
            <div class={styles.toolbarHost}>
              <MainToolbar
                mode={mode()}
                onMode={(slot) => {
                  setPopup(undefined);
                  if (slot !== 'blend') {
                    session.chooseTool(slot);
                  }
                }}
                onBrushes={(slot, anchor) => {
                  void session.library.loadAll();
                  togglePopup(slot === 'eraser' ? 'eraser' : 'brushes', anchor);
                }}
                sizeFraction={geometricFraction(brush().size, minBrushSize, maxSize())}
                onSize={(fraction) => tools.updateBrush({ size: geometricValue(fraction, minBrushSize, maxSize()) })}
                onSizeTap={(anchor) => togglePopup('size', anchor)}
                opacityValue={opacityValue()}
                opacityLabel={opacityLabels[opacityTarget()]}
                onOpacity={(value) => setOpacityValue(Math.round(value * 100) / 100)}
                onOpacityTap={(anchor) => togglePopup('opacity', anchor)}
                color={brush().color}
                brightness={currentHsv().v}
                onBrightness={setBrightness}
                onColorTap={(anchor) => togglePopup('color', anchor)}
                onEyedropper={eyedropper}
                onReadout={setReadout}
                disabled={!adjustable()}
                position={toolbarPosition()}
                strip={
                  colorSettings.settings().recentStrip ? (
                    <RecentColorsStrip
                      colors={colorHistory()}
                      height={toolbarColumnHeight}
                      side={toolbarPosition().x > innerWidth / 2 ? 'left' : 'right'}
                      onPick={(color) => tools.updateBrush({ color })}
                    />
                  ) : undefined
                }
                onMove={(position, done) => {
                  const x = snapToEdge(position.x);
                  setToolbarAt({ x, y: Math.max(0, Math.min(0.9, position.y / innerHeight)) }, done);
                }}
              />
            </div>
          </Errored>

          <Show when={layersOpen()}>
            <WantThumbnails want={() => session.layerThumbnails.want(64)} />
            <div class={styles.layers}>
              <LayerPanel
                layers={engine.state().layers}
                activeId={engine.state().activeId}
                thumbnail={(id) => session.layerThumbnails.thumbnail(id)?.src}
                expanded={layersExpanded()}
                onExpanded={setLayersExpanded}
                ready={ready()}
                onAction={(action) => session.edit({ type: 'layer', action })}
              />
            </div>
          </Show>

          <div
            class={styles.miniBars}
            style={{
              right: `${layersOpen() ? layerPanelWidths[layersExpanded() ? 'expanded' : 'collapsed'] + 8 : 8}px`
            }}
          >
            <ToolMiniBars bars={miniBars()} />
          </div>

          <HistoryControls
            canUndo={engine.state().canUndo}
            canRedo={engine.state().canRedo}
            states={engine.state().historyStates.length}
            current={historyIndex()}
            disabled={!ready()}
            onUndo={() => session.undo()}
            onRedo={() => session.redo()}
            onStep={(steps) => {
              for (let step = 0; step < Math.abs(steps); step++) {
                if (steps < 0) {
                  session.undo();
                } else {
                  session.redo();
                }
              }
            }}
          />

          <Show when={readoutView()}>{(view) => <Readout {...view()} />}</Show>
        </Show>

        <Show when={popup()} keyed>
          {(open) => (
            <Errored fallback={<p class={styles.failed}>This panel failed to open.</p>}>
              <Anchored
                anchor={open.anchor}
                side={belowTopBar.has(open.id) ? 'below' : 'beside'}
                beside={open.anchor.closest<HTMLElement>('[aria-label="Main toolbar"]') ?? undefined}
              >
                <Switch>
                  <Match when={open.id === 'creative'}>
                    <ToolsMenu
                      label="Creative Tools"
                      sections={creativeTools}
                      available={actions.available}
                      active={actions.active}
                      onRun={runEntry}
                      onDragStart={(item, point, event) => {
                        setPopup(undefined);
                        dockDrag.start(item.id, 'menu', point, event.pointerId);
                      }}
                    />
                  </Match>
                  <Match when={open.id === 'editing'}>
                    <ToolsMenu
                      label="Editing Tools"
                      sections={editingTools}
                      available={actions.available}
                      active={actions.active}
                      onRun={runEntry}
                      onDragStart={(item, point, event) => {
                        setPopup(undefined);
                        dockDrag.start(item.id, 'menu', point, event.pointerId);
                      }}
                    />
                  </Match>
                  <Match when={open.id === 'options'}>
                    <OptionsMenu
                      available={actions.available}
                      onRun={runEntry}
                      onExport={(format) => {
                        setPopup(undefined);
                        session.edit({ type: format });
                      }}
                    />
                  </Match>
                  <Match when={open.id === 'selection'}>
                    <SelectionMenu
                      ready={ready() && !selection.busy()}
                      onAction={(action) => {
                        setPopup(undefined);
                        if (action === 'invert') {
                          selection.invert();
                        } else if (action === 'clear') {
                          selection.clear();
                        } else {
                          selection.action(action);
                        }
                      }}
                    />
                  </Match>
                  <Match when={open.id === 'brushes' || open.id === 'eraser'}>
                    <BrushSelector
                      presets={session.library.presets()}
                      resources={session.library.resources}
                      recent={session.recentPresets.recent(12)}
                      preset={open.id === 'eraser' && tools.eraserMode() === 'clear' ? '' : tools.preset()}
                      disabled={!ready() || session.uploads.busy()}
                      favorites={favorites.favorites()}
                      onFavorite={favorites.toggle}
                      onChoose={(id) => void session.choosePreset(id, open.id === 'eraser' ? 'eraser' : 'brush')}
                      onImport={openAbrViewer}
                    />
                  </Match>
                  <Match when={open.id === 'color'}>
                    <ColorPanel
                      color={brush().color}
                      previous={previousColor()}
                      recent={colorHistory()}
                      settings={colorSettings.settings()}
                      onSettings={colorSettings.update}
                      onInput={(color) => tools.updateBrush({ color })}
                      onCommit={(color) => tools.updateBrush({ color })}
                      onEyedropper={() => {
                        setPopup(undefined);
                        colorPicker.arm();
                      }}
                    />
                  </Match>
                  <Match when={open.id === 'size'}>
                    <BrushSizePopup
                      brush={brush()}
                      resources={async () => {
                        const preset = session.library.find(tools.preset());
                        if (!preset) {
                          return [];
                        }
                        const result = await session.library.resources(preset);
                        if (result.isErr()) {
                          throw result.error;
                        }
                        return result.value;
                      }}
                      disabled={!adjustable()}
                      onChange={tools.updateBrush}
                    />
                  </Match>
                  <Match when={open.id === 'opacity'}>
                    <BrushOpacityPopup
                      brush={brush()}
                      resources={async () => {
                        const preset = session.library.find(tools.preset());
                        if (!preset) {
                          return [];
                        }
                        const result = await session.library.resources(preset);
                        if (result.isErr()) {
                          throw result.error;
                        }
                        return result.value;
                      }}
                      disabled={!adjustable()}
                      onChange={tools.updateBrush}
                      target={opacityTarget()}
                      onTarget={(target) => setOpacityTarget(target)}
                    />
                  </Match>
                </Switch>
              </Anchored>
            </Errored>
          )}
        </Show>

        <Show when={dockDrag.drag()}>
          {(drag) => (
            <span class={styles.dragGhost} style={{ left: `${drag().at.x}px`, top: `${drag().at.y}px` }}>
              <InfiniteIcon name={findTool(drag().id)?.icon ?? 'plus'} size={22} />
            </span>
          )}
        </Show>

        <SessionNotices session={session} />
      </div>

      <input
        ref={drawingInput}
        type="file"
        accept=".paint,.psd,application/json,image/vnd.adobe.photoshop"
        hidden
        onChange={(event) => picked(event, (file) => session.edit({ type: 'import', file }))}
      />
      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => picked(event, (file) => session.images.place(file))}
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

  /** Opens the ABR importer, the brush selector's "+". */
  function openAbrViewer() {
    setPopup(undefined);
    setAbrMounted(true);
    setAbrOpen(true);
  }
}

/** The open menu or pop-up and the button it opened from. */
type OpenPopup = {
  id: TopBarMenu | 'brushes' | 'eraser' | 'size' | 'opacity' | 'color';
  anchor: HTMLElement;
};

/** Tools that show a mini-toolbar while on, in stacking order. */
const miniBarTools = [
  'select-lasso',
  'select-rect',
  'select-wand',
  'select-poly',
  'select-circle',
  'fill',
  'gradient',
  'local-undo',
  'lazy',
  'vertical',
  'horizontal',
  'radial',
  'kaleido'
] as const;

/** Menus that hang under the top bar; the others open beside the main toolbar. */
const belowTopBar = new Set<OpenPopup['id']>(['creative', 'editing', 'options', 'selection']);

/** The top bar menu among the open pop-ups, which its button marks. */
function topBarMenu(id: OpenPopup['id'] | undefined): TopBarMenu | undefined {
  return id === 'creative' || id === 'editing' || id === 'options' || id === 'selection' ? id : undefined;
}

const opacityLabels: Record<OpacityTarget, string> = { opacity: 'Opacity', flow: 'Flow', softness: 'Softness' };

/** How long, in milliseconds, a color must stay before the color history takes it. */
const historySettleMs = 700;

/** The main toolbar's column height in CSS pixels, which the Recent Colors strip matches. */
const toolbarColumnHeight = 264;

/** The smallest brush size the Size button reaches, in document pixels. */
const minBrushSize = 0.5;

/**
 * Asks the engine for layer thumbnails while mounted, as the layer panel shows them; see
 * `session.layerThumbnails.want`.
 */
function WantThumbnails(props: { want: () => () => void }) {
  onSettled(() => untrack(() => props.want()));
  return null;
}

/**
 * Infinite Painter's Selection menu, which the top bar shows while a selection exists (manual p. 298): the content and
 * mask commands Paint's selection has.
 */
function SelectionMenu(props: {
  ready: boolean;
  onAction: (action: 'copy' | 'cut' | 'paste' | 'delete' | 'new-layer' | 'invert' | 'clear') => void;
}) {
  return (
    <div class={[theme.panel, styles.selectionMenu]} role="menu" aria-label="Selection">
      <h3 class={theme.sectionTitle}>Selection</h3>
      <For each={selectionCommands}>
        {(command) => (
          <button role="menuitem" disabled={!props.ready} onClick={() => props.onAction(command.id)}>
            {command.label}
          </button>
        )}
      </For>
    </div>
  );
}

const selectionCommands = [
  { id: 'invert', label: 'Invert' },
  { id: 'clear', label: 'Clear selection' },
  { id: 'copy', label: 'Copy' },
  { id: 'cut', label: 'Cut' },
  { id: 'paste', label: 'Paste' },
  { id: 'new-layer', label: 'Isolate to a new layer' },
  { id: 'delete', label: 'Delete' }
] as const;

/** Snaps a toolbar placed within {@link edgeSnap} of the screen's left or right edge to that edge. */
function snapToEdge(x: number) {
  if (x < edgeSnap) {
    return 8;
  }

  const right = innerWidth - toolbarWidth - 20;
  return x > right - edgeSnap ? right : x;
}

/** CSS pixels from a screen edge within which the toolbar snaps to it. */
const edgeSnap = 32;

/** A signal kept in `localStorage` under `key`; `set(value, false)` changes it for now and stores nothing yet. */
function createStoredSignal<T>(key: string, fallback: T) {
  const [value, setValue] = createSignal<T>(read() as Exclude<T, Function>);

  function read(): T {
    try {
      const stored = localStorage.getItem(key);
      return stored === null ? fallback : (JSON.parse(stored) as T);
    } catch {
      return fallback;
    }
  }

  return [
    value,
    (next: T, store = true) => {
      setValue(() => next);
      if (!store) {
        return;
      }

      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Keep it for this session.
      }
    }
  ] as const;
}

/** Calls `use` with the file chosen in a file input and clears the input for the next choice. */
function picked(event: Event & { currentTarget: HTMLInputElement }, use: (file: File) => void) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  input.value = '';
  if (file) {
    use(file);
  }
}

/** A portable drawing with one empty layer and the camera at the origin. */
function blankDrawing() {
  const layer = {
    id: 'layer-1',
    name: 'Layer 1',
    visible: true,
    opacity: 1,
    blend: 'normal' as const,
    tiles: new Map()
  };
  return encodeDocument(snapshotDocument([layer], layer.id, defaultCamera(), {}));
}

/** A brush size for display: tenths below 10 px, whole pixels above. */
function formatSize(size: number) {
  return size < 10 ? size.toFixed(1).replace(/\.0$/, '') : String(Math.round(size));
}
