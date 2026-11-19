import { createEventListener } from '@solid-primitives/event-listener';
import { createElementSize } from '@solid-primitives/resize-observer';
import type { JSX } from '@solidjs/web';
import { createSignal, Match, Show, Switch } from 'solid-js';
import type { PaintVariantProps } from '..';
import { AbrViewerDialog } from '../../features/abr';
import { brushSettingName } from '../../features/brush-editor/brushSettingName';
import { BrushStudioDialog } from '../../features/brush/BrushStudioDialog';
import {
  createPaintSession,
  PaintEditor,
  PaintStage,
  SessionNotices,
  StageGuides,
  StageOverlays
} from '../../features/session';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import { besideRect, findPart, type Span } from './board';
import { BoardView, type BoardControls } from './BoardView';
import { createBoard } from './createBoard';
import { createSheet } from './createSheet';
import { FileApplicationControls } from './FileMenu';
import { cellGap, createGrid, GridContext, referenceCell } from './grid';
import { createKits } from './kits';
import { createLegoServices, LegoServicesContext } from './LegoServices';
import styles from './LegoStudio.module.css';
import { LookChooser } from './LookChooser';
import { chooseLook } from './looks';
import { PartFrame } from './PartFrame';
import { currentKind, partDefinition } from './parts';
import { brushSettingKind } from './parts/brushChannels';
import type { Popup } from './parts/definition';
import { penPressureKind, pressureCurveSpan } from './parts/pressureCurve';
import { StudioSettingRow } from './StudioSettingRow';
import { createTileLook } from './tileLook';
import { TileLookSwitch } from './TileLookSwitch';

/**
 * The Paint interface, a UI built like printed LEGO tiles: panels lie freely on the drawing, each a plate
 * of studs, and parts sit on the studs in any whole number of cells. A part shows more the larger it is, like an
 * Android widget: a brush is a stroke sample, then gets its name, then a large sample; a value is a knob that opens a
 * slider, then a slider itself. Parts never overlap; placing or growing one pushes the others aside, and that is how
 * a panel grows. Only popups float over them. A part with several looks, such as a color picker or a value, takes
 * the one chosen for its size. A color swatch opens a panel of its own, built like any other; panels can be kept as
 * kits and placed again.
 *
 * "Edit" shows the studs and the handle of the box of parts in a strip along the bottom, the drawing shrinking to a
 * card above it; the box is a sheet pulled up by a wheel, its handle or two fingers anywhere, the card shrinking
 * further, with the workbench to build a kit on at full size: drag parts out of the box, between
 * panels and back, size them by their corner and move panels by their rim; a long press on a free spot offers the
 * parts right there (see `BoardView`). The board is kept per device.
 *
 * The "Brush settings" part opens the brush studio over everything, in the board's plates and tiles: each number
 * setting there is its value part itself, and the Pen page the pen pressure curve's part (`StudioSettingRow`); a
 * row's grip lifts a new part of it onto the board, in edit mode or not; the studio gets out of the way while the part
 * is carried and comes back once it lands. Pen pressure lives on the studio's Pen page: the "Pressure calibration"
 * part opens the studio there, and the curve's Measure, on the board or on that page, runs the calibration steps
 * there, drawn on the studio's pad.
 */
export function LegoStudio(
  props: PaintVariantProps & {
    /** Positive grid cell edge in CSS pixels. A stored trial size takes precedence. */
    cellSize?: number;
    /** Host-owned installation, offline status and build identity in the File menu. */
    applicationControls?: JSX.Element;
  }
) {
  const [editing, setEditing] = createSignal(false);
  /** The swatch whose panel is open; see `BoardView`. */
  const [openPanel, setOpenPanel] = createSignal<string>();
  const [popup, setPopup] = createSignal<{ popup: Popup; rect: DOMRect }>();
  const [popupElement, setPopupElement] = createSignal<HTMLElement>();
  const popupSize = createElementSize(popupElement);
  const session = createPaintSession({
    panel: () => {
      const open = popup()?.popup;

      return open?.kind === 'part' ? open.partKind : open?.kind;
    }
  });
  /** Whether the brush studio, opened by the "Brush settings" part, covers the screen. */
  const [studioOpen, setStudioOpen] = createSignal(false);
  /** Whether the studio opens on its Pen page, as the pressure parts open it. */
  const [studioOnPen, setStudioOnPen] = createSignal(false);
  /** The board's commands, which the studio's rows lift new parts with; set by the board as it is made. */
  const [boardControls, setBoardControls] = createSignal<BoardControls | undefined>(undefined, { ownedWrite: true });
  const reportSavingError = (message: string) =>
    session.setError((current) => current ?? { kind: 'lego', code: 'storage', message });
  const board = createBoard(reportSavingError);
  /** TEMPORARY: the tile look trial's choice, applied to the whole editor; see `tileLook.ts`. */
  const tileLook = createTileLook();
  const grid = createGrid(() => tileLook.look().cellSize ?? props.cellSize);
  /** Whether the studio's Pen page runs the calibration steps. */
  const [penMeasuring, setPenMeasuring] = createSignal(false);
  const [abrViewer, setAbrViewer] = createSignal<'open' | 'closed'>();
  const services = createLegoServices(
    session,
    () => {
      setStudioOnPen(false);
      setStudioOpen(true);
    },
    () =>
      studioOpen() ||
      board.board().panels.some((panel) => panel.parts.some((part) => part.kind.startsWith('value:brush:abr-'))),
    (measure) => {
      if (measure) {
        setPenMeasuring(true);
      }

      if (!studioOpen()) {
        setStudioOnPen(true);
        setStudioOpen(true);
      }
    },
    () => {
      setPopup(undefined);
      setAbrViewer('open');
    }
  );
  const closeStudio = () => {
    setPenMeasuring(false);
    setStudioOpen(false);
  };
  /** Whether a part of `kind` lies on the board, outside the workbench. */
  const onBoard = (kind: string) =>
    board.board().panels.some((panel) => !panel.bench && panel.parts.some((part) => currentKind(part.kind) === kind));
  const kits = createKits(reportSavingError);
  /** The box of parts while editing; each edit starts with it closed. */
  const sheet = createSheet(() => session.size().height);
  /**
   * How the drawing and the board shrink to a card above the sheet while editing: by how much of the way to its middle
   * stop the sheet is up (`progress`), the most there, centered across and a margin down; a little above a closed
   * sheet's strip, and at full size while the sheet is sunk.
   */
  const card = () => {
    const { width, height } = session.size();
    const middle = sheet.middle();
    const up = editing() && !sheet.sunk() ? Math.max(grid.pitch(), sheet.height()) : 0;
    const progress = middle > 0 ? Math.min(up, middle) / middle : 0;
    const smallest = Math.max(0.3, (height - middle - cardMargin * 2) / height);
    const scale = 1 - progress * (1 - smallest);
    return { progress, scale, x: (width * (1 - scale)) / 2, y: cardMargin * progress };
  };

  session.createShortcuts({
    closePanel() {
      // Escape and the Android back gesture close the studio first, keeping its changes, as Done does.
      if (studioOpen()) {
        closeStudio();
        return true;
      }

      if (popup()) {
        setPopup(undefined);
        return true;
      }

      if (openPanel()) {
        setOpenPanel(undefined);
        return true;
      }

      if (editing() && sheet.back()) {
        return true;
      }

      if (editing()) {
        setEditing(false);
        return true;
      }

      return false;
    }
  });

  // A press anywhere but in the popup closes it; the press goes on to draw or to press a part.
  createEventListener(
    window,
    'pointerdown',
    (event) => {
      const element = popupElement();
      if (popup() && !(event.target instanceof Node && element?.contains(event.target))) {
        setPopup(undefined);
      }
    },
    { capture: true }
  );

  // The library lists the user's presets for the board and the box.
  void session.library.loadAll();

  const popupPlace = () => {
    const open = popup();
    if (!open) {
      return undefined;
    }

    // Placed by its measured size; it stays hidden until measured.
    return besideRect(open.rect, { width: popupSize.width ?? 0, height: popupSize.height ?? 0 }, session.size());
  };

  return (
    <GridContext value={grid}>
      <LegoServicesContext value={services}>
        <PaintEditor
          session={session}
          class={`${styles.editor} ${card().progress > 0 ? styles.carded : ''} ${tileLook.look().squircle ? styles.squircleLook : ''}`}
          style={{
            '--lego-cell': `${grid.cell()}px`,
            '--lego-gap': `${cellGap}px`,
            '--lego-hit-size': `${referenceCell}px`,
            '--lego-radius': `${(tileLook.look().radius * grid.cell()) / referenceCell}px`,
            '--card-scale': `${card().scale}`,
            '--card-x': `${card().x}px`,
            '--card-y': `${card().y}px`,
            // The card follows a wheel or a finger closely, and moves to a stop or springs back slower.
            '--sheet-time': sheet.settling() ? '260ms' : '70ms'
          }}
        >
          <PaintStage session={session} class={styles.workspace}>
            <StageGuides session={session} />
            <StageOverlays session={session} />
          </PaintStage>
          <div class={styles.ui}>
            <BoardView
              board={board}
              kits={kits}
              session={session}
              editing={editing()}
              openPanel={openPanel()}
              onOpenPanel={setOpenPanel}
              sheet={sheet}
              onPopup={(anchor, next) => setPopup({ popup: next, rect: anchor.getBoundingClientRect() })}
              ref={setBoardControls}
            />
            <Show when={popup() && popupPlace()}>
              {(place) => (
                <div
                  ref={setPopupElement}
                  class={styles.popup}
                  data-keeps-panel
                  style={{
                    left: `${place().x}px`,
                    top: `${place().y}px`,
                    visibility: popupSize.width ? undefined : 'hidden'
                  }}
                >
                  <Switch>
                    <Match when={popup()?.popup.kind === 'looks' && popup()!.popup}>
                      {(open) => {
                        const id = () => (open() as Extract<Popup, { kind: 'looks' }>).id;
                        return (
                          <PartFrame kind="Looks">
                            <Show when={findPart(board.board(), id())?.part}>
                              {(part) => (
                                <LookChooser
                                  part={part()}
                                  onLook={(look) => board.set(chooseLook(board.latest(), id(), part().span, look))}
                                />
                              )}
                            </Show>
                          </PartFrame>
                        );
                      }}
                    </Match>
                    <Match when={popup()?.popup.kind === 'part' && popup()!.popup}>
                      {(open) => (
                        <FileApplicationControls
                          value={props.applicationControls ? () => props.applicationControls : null}
                        >
                          <PartFrame
                            kind={(open() as Extract<Popup, { kind: 'part' }>).partKind}
                            popup
                            onDone={() => setPopup(undefined)}
                          />
                        </FileApplicationControls>
                      )}
                    </Match>
                    <Match when={popup()?.popup.kind === 'note' && popup()!.popup}>
                      {(open) => (
                        <PartFrame kind="Note">
                          <p class={styles.note}>{(open() as Extract<Popup, { kind: 'note' }>).text}</p>
                        </PartFrame>
                      )}
                    </Match>
                  </Switch>
                </div>
              )}
            </Show>
            <div class={styles.controls}>
              <TileLookSwitch cellSize={grid.cell()} look={tileLook.look()} onChange={tileLook.change} />
              <Show when={props.experimentsHref}>
                {(href) => (
                  <a class={styles.editButton} href={href()}>
                    Exit
                  </a>
                )}
              </Show>
              <Show when={session.fullscreen.shown}>
                {/* On a tablet, full screen also hides Android's bars and makes its edge swipes take two tries. */}
                <button type="button" class={[styles.editButton, styles.iconButton]} {...session.fullscreen.props}>
                  <SketchIcon name={session.fullscreen.isActive() ? 'fullscreenExit' : 'fullscreen'} size={18} />
                </button>
              </Show>
              <button
                type="button"
                class={styles.editButton}
                data-active={editing() ? '' : undefined}
                onClick={() => {
                  setPopup(undefined);
                  setOpenPanel(undefined);
                  sheet.to('closed');
                  setEditing(!editing());
                }}
              >
                {editing() ? 'Done' : 'Edit'}
              </button>
            </div>
            <Show when={abrViewer() !== undefined}>
              <AbrViewerDialog
                open={abrViewer() === 'open'}
                close={() => setAbrViewer('closed')}
                mixing={session.brush().mixing}
                onMixingChange={(mixing) => session.tools.updateBrush({ mixing })}
                onUseBrush={session.presets.useBrush}
              />
            </Show>
            <Show when={studioOpen()}>
              <BrushStudioDialog
                class={styles.brushStudio}
                session={session}
                editor={services.brushEditor}
                away={boardControls()?.carrying() ?? false}
                hostRow={(setting, category) => {
                  const kind = brushSettingKind(setting.id);
                  if (!partDefinition(kind)) {
                    return undefined;
                  }

                  return (
                    <StudioSettingRow
                      kind={kind}
                      span={studioPartSpan}
                      look="slider"
                      label={brushSettingName(category, setting)}
                      onBoard={onBoard(kind)}
                      onLift={(event) => boardControls()?.lift(event, kind, studioPartSpan)}
                      onPlace={() => boardControls()?.place(kind, studioPartSpan)}
                    />
                  );
                }}
                penPane={
                  <StudioSettingRow
                    kind={penPressureKind}
                    span={studioCurveSpan}
                    look="curve"
                    tall
                    label="Pen pressure"
                    onBoard={onBoard(penPressureKind)}
                    onLift={(event) => boardControls()?.lift(event, penPressureKind, pressureCurveSpan)}
                    onPlace={() => boardControls()?.place(penPressureKind, pressureCurveSpan)}
                  />
                }
                startOnPen={studioOnPen()}
                measuring={penMeasuring()}
                onMeasuring={setPenMeasuring}
                onClose={closeStudio}
              />
            </Show>
            <SessionNotices session={session} />
          </div>
        </PaintEditor>
      </LegoServicesContext>
    </GridContext>
  );
}

/** CSS pixels around the card the drawing shrinks to. */
const cardMargin = 16;

/**
 * The span of a number's part lifted from the brush studio, and the span it shows at in its row: four cells across, as
 * a slider shows its name and value.
 */
const studioPartSpan: Span = { columns: 4, rows: 1 };

/** The span the pen pressure curve's part shows at on the studio's Pen page: a large graph, its name above it. */
const studioCurveSpan: Span = { columns: 8, rows: 6 };
