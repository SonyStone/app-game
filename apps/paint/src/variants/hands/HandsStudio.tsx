import { createEffect, createSignal, Errored, Match, Show, Switch } from 'solid-js';
import type { PaintVariantProps } from '..';
import { AbrViewerDialog } from '../../features/abr';
import { BrushAdjustHud } from '../../features/brush';
import {
  createPaintSession,
  PaintEditor,
  PaintStage,
  SessionNotices,
  StageGuides,
  StageHint,
  StageOverlays
} from '../../features/session';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import { watchTapTargets } from '../../shared/ui/watchTapTargets';
import { BrushList } from './BrushList';
import { ColorDisc } from './ColorDisc';
import { createFreeHand } from './createFreeHand';
import { createPenDrags } from './createPenDrags';
import { createPenModes, penModeInfo, type PenMode } from './createPenModes';
import { createPointerRing } from './createPointerRing';
import { DrawingPanel } from './DrawingPanel';
import { formatSize, FreeHandZone } from './FreeHandZone';
import type { Point, Side } from './geometry';
import { createGuideSeen, GuideCard } from './GuideCard';
import styles from './HandsStudio.module.css';
import { LayersList } from './LayersList';
import { ModeIcon } from './ModeIcon';
import { Ring } from './Ring';
import { SelectionBar } from './SelectionBar';
import { Sheet, type SheetTab } from './Sheet';
import sheetStyles from './Sheet.module.css';

/**
 * The Two hands variant, after Microsoft Research's "Pen + Touch = New Tools" (Hinckley et al., 2010): the pen only
 * draws, and the free hand is the interface, the way a painter's other hand holds the palette. A quiet shaded zone
 * along the free hand's edge (the right one by default, for a left-handed artist; the Drawing tab swaps it) takes
 * that hand's touches: one finger opens a ring of pen modes under it, held modes spring back when the finger lifts,
 * a long press opens a color disc, two fingers set the brush size and opacity, and three fingers open the sheet of
 * layers, brushes and file commands from the same edge (see `createFreeHand`). Touches elsewhere pan, pinch and tap
 * to undo and redo as usual; pens draw everywhere.
 *
 * Mouse and keyboard reach the same ring with the right button or Space (see `createPointerRing`), and B, E, I and L
 * choose tools. The pen modes line, pan and zoom are carried out by `createPenDrags`. A card explains the zone on the
 * first visit.
 */
export function HandsStudio(props: PaintVariantProps) {
  const [sheet, setSheet] = createSignal<SheetTab>();
  const [lastTab, setLastTab] = createSignal<SheetTab>('layers');
  const [side, setSide] = createStoredSide();
  const guide = createGuideSeen();
  const session = createPaintSession({ panel: () => sheet() });
  const { camera, engine, library, tools, brush, ready, selection, mixer, colorPicker, presets, transform } = session;
  // Created before the canvas mounts, in this order: each listens on the window ahead of the canvas input, and the
  // pen modes must see pen presses that the drags then consume.
  const modes = createPenModes(session);
  const drags = createPenDrags(session, modes.mode);
  const freeHand = createFreeHand({
    session,
    modes,
    side,
    enabled: () => sheet() === undefined,
    onLayers: () => toggleSheet('layers')
  });
  const pointerRing = createPointerRing(session, modes);
  /** Where the pen or mouse last hovered over the drawing, in canvas pixels, for previews of brush changes. */
  const [lastPen, setLastPen] = createSignal<Point>();
  const [abrOpen, setAbrOpen] = createSignal(false);
  const [abrMounted, setAbrMounted] = createSignal(false);
  const [ui, setUi] = createSignal<HTMLElement>();

  session.createShortcuts({
    closePanel() {
      if (sheet()) {
        setSheet(undefined);
        return true;
      }

      if (freeHand.ring()) {
        freeHand.closeRing();
        return true;
      }

      return false;
    }
  });
  createEffect(session.cursor, (point) => {
    if (point) {
      setLastPen(point);
    }
  });
  // The brushes tab lists the user's presets once it has read them.
  createEffect(
    () => sheet() === 'brushes',
    (open) => {
      if (open) {
        void library.loadAll();
      }
    }
  );
  // Chrome's touch adjustment would move a finger's press off the opacity field onto a nearby button.
  createEffect(ui, (element) => (element ? watchTapTargets(element) : undefined));

  /** The ring on screen: one the free hand opened, or else the pointer's. */
  const shownRing = () => {
    const finger = freeHand.ring();
    if (finger) {
      return {
        layout: finger.layout,
        hovered: finger.hovered ?? modes.held(),
        interactive: finger.state === 'open',
        choose: freeHand.choose,
        hover: undefined
      };
    }

    const layout = pointerRing.layout();
    return (
      layout && {
        layout,
        hovered: pointerRing.hovered(),
        interactive: true,
        choose: pointerRing.choose,
        hover: pointerRing.setHovered
      }
    );
  };
  /** The pen's mode, named beside a hovering pen when it is not the brush. */
  const badge = () => {
    const point = session.cursor();
    const mode = modes.mode();
    return point && mode !== 'brush' && !colorPicker.preview() ? { point, mode } : undefined;
  };
  /** Previews of the brush follow the pen: where it last hovered, or the middle of the drawing. */
  const previewPoint = () => lastPen() ?? { x: session.size().width / 2, y: session.size().height / 2 };

  return (
    <PaintEditor session={session} class={styles.editor}>
      <PaintStage session={session} input={{ puckPicker: pointerRing.picker }} class={stageClass(modes.mode())}>
        <StageGuides session={session} />
        <Show
          when={
            ready() &&
            engine.state().tileCount === 0 &&
            guide.seen() &&
            !sheet() &&
            modes.mode() === 'brush' &&
            !selection.selected()
          }
        >
          <StageHint>
            The pen draws. Your other hand: touch the shaded {side()} edge for tools, hold still there for color.
          </StageHint>
        </Show>
        <StageOverlays session={session} cursor={cursorModes.has(modes.mode())} />
        {/* A guide, not the stroke: the brush's pressure response decides the stroke's width. */}
        <Show when={drags.line()}>
          {(line) => (
            <svg class={styles.linePreview} aria-hidden="true">
              <line
                x1={line().from.x}
                y1={line().from.y}
                x2={line().to.x}
                y2={line().to.y}
                stroke={tools.slot() === 'eraser' ? '#8e8e93' : brush().color}
                stroke-width={2}
                stroke-linecap="round"
              />
              <circle cx={line().from.x} cy={line().from.y} r={3.5} />
              <circle cx={line().to.x} cy={line().to.y} r={3.5} />
            </svg>
          )}
        </Show>
        <Show when={freeHand.adjusting()}>
          <BrushAdjustHud
            anchor={previewPoint()}
            size={brush().size}
            opacity={brush().opacity}
            color={tools.slot() === 'eraser' ? '#8e8e93' : brush().color}
            zoom={camera.camera().zoom}
          />
        </Show>
        <Show when={badge()}>
          {(shown) => (
            <span
              class={styles.badge}
              data-held={modes.held() ? '' : undefined}
              style={{ left: `${shown().point.x}px`, top: `${shown().point.y}px` }}
              aria-hidden="true"
            >
              <ModeIcon mode={shown().mode} size={14} />
              {penModeInfo[shown().mode].label}
            </span>
          )}
        </Show>
      </PaintStage>
      <div ref={setUi} class={styles.ui}>
        <FreeHandZone
          zone={freeHand.zone()}
          active={freeHand.ring() !== undefined || freeHand.disc() !== undefined || freeHand.adjusting() !== undefined}
          mode={modes.mode()}
          held={modes.held() !== undefined}
          color={brush().color}
          size={brush().size}
          opacity={brush().opacity}
        >
          <button
            class={styles.zoneButton}
            aria-label="Layers, brushes and file"
            title="Layers, brushes and file · three-finger tap here"
            aria-expanded={sheet() ? 'true' : 'false'}
            onClick={() => toggleSheet(lastTab())}
          >
            <SketchIcon name="layers" size={20} />
          </button>
          <button
            class={styles.zoneButton}
            aria-label="Undo"
            aria-keyshortcuts="Control+Z Meta+Z"
            title="Undo · two-finger tap"
            disabled={!engine.state().canUndo || !ready()}
            onClick={() => session.undo()}
          >
            <SketchIcon name="undo" size={20} />
          </button>
          <button
            class={styles.zoneButton}
            aria-label="Redo"
            aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z"
            title="Redo · three-finger tap on the drawing"
            disabled={!engine.state().canRedo || !ready()}
            onClick={() => session.redo()}
          >
            <SketchIcon name="redo" size={20} />
          </button>
        </FreeHandZone>
        <Show when={(modes.mode() === 'lasso' || selection.selected()) && !transform.active()}>
          <SelectionBar
            lassoing={modes.mode() === 'lasso'}
            tool={selection.tool()}
            onTool={selection.setTool}
            selected={selection.selected() && !selection.drawing()}
            hasClipboard={selection.hasClipboard()}
            disabled={!ready() || selection.drawing() || selection.busy()}
            onAction={selection.action}
            onInvert={selection.invert}
            onFill={session.gradient.fillSelection}
            onTransform={() => modes.latch('transform')}
            onDeselect={selection.clear}
          />
        </Show>
        <Errored fallback={null}>
          <Show when={shownRing()}>
            {(ring) => (
              <Ring
                layout={ring().layout}
                hovered={ring().hovered}
                latched={modes.latched()}
                interactive={ring().interactive}
                onChoose={(mode: PenMode) => ring().choose(mode)}
                onHover={(mode) => ring().hover?.(mode)}
              />
            )}
          </Show>
          <Show when={freeHand.disc()}>
            {(open) => (
              <ColorDisc center={open().center} finger={open().finger} color={open().color} original={open().original} />
            )}
          </Show>
          <Show when={freeHand.adjusting()}>
            {(drag) => (
              <span
                class={styles.adjustChip}
                data-side={side()}
                style={{ left: `${drag().at.x}px`, top: `${drag().at.y}px` }}
                aria-hidden="true"
              >
                <span data-active={drag().axis === 'size' ? '' : undefined}>↕ {formatSize(brush().size)} px</span>
                <span data-active={drag().axis === 'opacity' ? '' : undefined}>
                  ↔ {Math.round(brush().opacity * 100)}%
                </span>
              </span>
            )}
          </Show>
        </Errored>
        <Show when={sheet()}>
          {(tab) => (
            <Errored fallback={<p class={styles.failed}>This panel failed to open.</p>}>
              <Sheet side={side()} tab={tab()} onTab={openTab} onClose={() => setSheet(undefined)}>
                <Switch>
                  <Match when={tab() === 'layers'}>
                    <LayersList
                      state={engine.state()}
                      ready={ready()}
                      onAction={(action) => session.edit({ type: 'layer', action })}
                    />
                  </Match>
                  <Match when={tab() === 'brushes'}>
                    <BrushList
                      presets={library.presets()}
                      preset={tools.preset()}
                      disabled={!ready() || session.uploads.busy()}
                      onChoose={session.usePreset}
                      onImport={openAbrViewer}
                    >
                      <section class={sheetStyles.section}>
                        <button
                          class={sheetStyles.row}
                          role="switch"
                          aria-checked={tools.eraserMode() === 'clear' && tools.canClear() ? 'true' : 'false'}
                          disabled={!tools.canClear()}
                          onClick={() => tools.setEraserMode(tools.eraserMode() === 'clear' ? 'preset' : 'clear')}
                        >
                          <span class={sheetStyles.label}>The eraser erases with the brush</span>
                          <span class={sheetStyles.switch} />
                        </button>
                        <Show when={mixer.available()}>
                          <button
                            class={sheetStyles.row}
                            disabled={!ready() || engine.commandBusy()}
                            onClick={() => void mixer.command('load')}
                          >
                            <span class={sheetStyles.label}>Load the Mixer Brush</span>
                          </button>
                          <button
                            class={sheetStyles.row}
                            disabled={!ready() || engine.commandBusy()}
                            onClick={() => void mixer.command('clean')}
                          >
                            <span class={sheetStyles.label}>Clean the Mixer Brush</span>
                          </button>
                        </Show>
                      </section>
                    </BrushList>
                  </Match>
                  <Match when={tab() === 'drawing'}>
                    <DrawingPanel
                      ready={ready()}
                      side={side()}
                      onSide={setSide}
                      onOpen={(file) => {
                        setSheet(undefined);
                        session.edit({ type: 'import', file });
                      }}
                      onInsertImage={(file) => {
                        setSheet(undefined);
                        session.images.place(file);
                      }}
                      onSave={() => session.edit({ type: 'download' })}
                      onExport={(format) => session.edit({ type: format })}
                      onResetView={camera.reset}
                      onFlipView={camera.toggleMirror}
                      mirrored={camera.camera().mirrored}
                      fullscreen={{
                        active: session.fullscreen.isActive(),
                        supported: document.fullscreenEnabled,
                        toggle: () => void session.fullscreen.props.onClick()
                      }}
                      onGuide={() => {
                        setSheet(undefined);
                        guide.show();
                      }}
                      experimentsHref={props.experimentsHref}
                    />
                  </Match>
                </Switch>
              </Sheet>
            </Errored>
          )}
        </Show>
        <Show when={!guide.seen()}>
          <GuideCard side={side()} zone={freeHand.zone()} onDismiss={guide.dismiss} />
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

  /** Opens the sheet on `tab`, or closes it when it is open. */
  function toggleSheet(tab: SheetTab) {
    if (sheet()) {
      setSheet(undefined);
      return;
    }

    openTab(tab);
  }

  function openTab(tab: SheetTab) {
    freeHand.closeRing();
    pointerRing.close();
    setLastTab(tab);
    setSheet(tab);
  }

  function openAbrViewer() {
    setSheet(undefined);
    setAbrMounted(true);
    setAbrOpen(true);
  }
}

/** Pen modes that draw, so the brush cursor shows while the pen hovers. */
const cursorModes = new Set<PenMode>(['brush', 'eraser', 'line']);

/** The canvas's mouse cursor for the pen modes that move the view. */
function stageClass(mode: PenMode) {
  return mode === 'pan' ? styles.panning : mode === 'zoom' ? styles.zooming : '';
}

/**
 * Which hand is free, and so which edge holds its zone: the right by default, for a left-handed artist holding the pen
 * in the left hand. Kept in `localStorage`; storage failures keep the choice for this session.
 */
function createStoredSide() {
  const [side, setSide] = createSignal<Side>(readSide());

  return [
    side,
    (next: Side) => {
      setSide(next);
      try {
        localStorage.setItem(sideKey, next);
      } catch {
        // Keep the choice for this session.
      }
    }
  ] as const;
}

function readSide(): Side {
  try {
    return localStorage.getItem(sideKey) === 'left' ? 'left' : 'right';
  } catch {
    return 'right';
  }
}

const sideKey = 'paint.hands.side';
