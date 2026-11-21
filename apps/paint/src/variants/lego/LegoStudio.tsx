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
import { besideRect, findPart, safeArea, type Span } from './board';
import { BoardView, type BoardControls } from './BoardView';
import { createBoard } from './createBoard';
import { FileApplicationControls } from './FileMenu';
import { cellGap, createGrid, GridContext, plateRadius, referenceCell } from './grid';
import { createKits } from './kits';
import layerProtoStyles from './layersPrototype/LayersPrototype.module.css';
import { createLegoServices, LegoServicesContext } from './LegoServices';
import styles from './LegoStudio.module.css';
import { LookChooser } from './LookChooser';
import { chooseLook } from './looks';
import { createLegoOptions, deviceCell } from './options';
import { PartFrame } from './PartFrame';
import { currentKind, partDefinition } from './parts';
import { brushSettingKind } from './parts/brushChannels';
import type { Popup } from './parts/definition';
import { penPressureKind, pressureCurveSpan } from './parts/pressureCurve';
import { namedSliderSpan } from './parts/values';
import type { CatalogTarget } from './PartsTray';
import { StudioSettingRow } from './StudioSettingRow';

/**
 * The Paint interface, a UI built like printed LEGO tiles: panels lie freely on the drawing at 1:1 scale, each a plate
 * of studs, and parts sit on the studs in any whole number of cells. A part shows more the larger it is, like an
 * Android widget: a brush is a stroke sample, then gets its name, then a large sample; a value is a knob that opens a
 * slider, then a slider itself. Parts never overlap; placing or growing one pushes the others aside, and that is how
 * a panel grows. Only popups float over them. A part with several looks, such as a color picker or a value, takes
 * the one chosen for its size. A color swatch opens a panel of its own, built like any other; panels can be kept as
 * kits and placed again.
 *
 * Layout editing is entered by long-pressing any LEGO panel/part, or via File → Edit layout / Options → Interface.
 * The drawing stays 1:1 throughout; a draggable Edit bar placed on a free spot opens the modal Parts catalog
 * (`PartsTray`) and finishes editing (see `BoardView`). The board is kept per device.
 *
 * The "Brush settings" part opens the brush studio over everything, in the board's plates and tiles: each number
 * setting there is its value part itself, and the Pen page the pen pressure curve's part (`StudioSettingRow`); a
 * row's grip lifts a new part of it onto the board, in edit mode or not; the studio gets out of the way while the part
 * is carried and comes back once it lands. Pen pressure lives on the studio's Pen page: the "Pressure calibration"
 * part opens the studio there, and the curve's Measure, on the board or on that page, runs the calibration steps
 * there, drawn on the studio's pad.
 *
 * The "Options" part and the File menu's Options open the editor's own settings over everything (`OptionsSheet`),
 * among them the grid size, which every plate and part follows at once.
 */
export function LegoStudio(
  props: PaintVariantProps & {
    /**
     * The grid's cell edge in CSS pixels while the user has not chosen one: the grid size the user picks in Options,
     * kept on the device, wins over it, and without either the device's default (`deviceCell`) applies. A
     * value that is not a positive number counts as absent.
     */
    cellSize?: number;
    /** Host-owned installation, offline status and build identity in the File menu. */
    applicationControls?: JSX.Element;
  }
) {
  const [editing, setEditing] = createSignal(false);
  /** Which section the unified Options & Parts dialog is open on, or `undefined` while closed. */
  const [catalog, setCatalog] = createSignal<CatalogTarget>();
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
  /** The editor's options on this device, read before the first layout. */
  const options = createLegoOptions();
  /** The cell: the user's choice, else the host's, else the device's default. */
  const grid = createGrid(() => options.cell() ?? validCell(props.cellSize) ?? deviceCell());
  /** Whether the studio's Pen page runs the calibration steps. */
  const [penMeasuring, setPenMeasuring] = createSignal(false);
  const [abrViewer, setAbrViewer] = createSignal<'open' | 'closed'>();

  const enterEdit = () => {
    setPopup(undefined);
    setOpenPanel(undefined);
    setCatalog(undefined);
    setEditing(true);
  };
  const exitEdit = () => {
    setPopup(undefined);
    setOpenPanel(undefined);
    setCatalog(undefined);
    setEditing(false);
  };

  const services = createLegoServices(
    session,
    () => {
      setStudioOnPen(false);
      setStudioOpen(true);
    },
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
    },
    {
      cell: grid.cell,
      setCell: options.setCell,
      open: () => {
        setPopup(undefined);
        setCatalog('interface');
      },
      editLayout: enterEdit
    }
  );
  /** A setting's part as it leaves the studio: a slider with room for its full name and value. */
  const liftedSpan = (kind: string) => namedSliderSpan(kind, services, grid.minimumSpan) ?? studioPartSpan;
  const closeStudio = () => {
    setPenMeasuring(false);
    setStudioOpen(false);
  };
  /** Whether a part of `kind` lies on the board. */
  const onBoard = (kind: string) =>
    board.board().panels.some((panel) => panel.parts.some((part) => currentKind(part.kind) === kind));
  const kits = createKits(reportSavingError);

  session.createShortcuts({
    closePanel() {
      // Escape and the Android back gesture close a dialog first, keeping its changes, as Done does.
      if (catalog() !== undefined) {
        setCatalog(undefined);
        return true;
      }

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

      if (editing()) {
        exitEdit();
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

  // The library lists the user's presets for the board and the catalog.
  void session.library.loadAll();

  const popupPlace = () => {
    const open = popup();
    if (!open) {
      return undefined;
    }

    // Placed by its measured size inside `safeArea`; it stays hidden until measured.
    const size = session.size();
    return besideRect(
      open.rect,
      { width: popupSize.width ?? 0, height: popupSize.height ?? 0 },
      size,
      safeArea(grid.pitch(), board.board(), size, editing())
    );
  };

  return (
    <GridContext value={grid}>
      <LegoServicesContext value={services}>
        <PaintEditor
          session={session}
          class={styles.editor}
          style={{
            '--lego-cell': `${grid.cell()}px`,
            '--lego-gap': `${cellGap}px`,
            '--lego-hit-size': `${referenceCell}px`,
            '--lego-radius': `${plateRadius(grid.cell())}px`
          }}
        >
          <PaintStage session={session} class={styles.workspace}>
            <StageGuides session={session} />
            <StageOverlays session={session} />
            <Show when={services.layersPrototype.target() === 'mask' && services.layersPrototype.maskOverlay()}>
              <div class={layerProtoStyles.rubylithOverlay} data-rubylith-overlay="" aria-hidden="true" />
            </Show>
          </PaintStage>
          <div class={styles.ui}>
            <BoardView
              board={board}
              kits={kits}
              session={session}
              editing={editing()}
              catalog={catalog()}
              onOpenCatalog={setCatalog}
              onCloseCatalog={() => setCatalog(undefined)}
              onEnterEdit={enterEdit}
              onExitEdit={exitEdit}
              openPanel={openPanel()}
              onOpenPanel={setOpenPanel}
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
                      onLift={(event) => boardControls()?.lift(event, kind, liftedSpan(kind))}
                      onPlace={() => boardControls()?.place(kind, liftedSpan(kind))}
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

/** `cell` when it is a positive number of pixels, else `undefined`. */
function validCell(cell: number | undefined) {
  return cell !== undefined && Number.isFinite(cell) && cell > 0 ? cell : undefined;
}

/**
 * The span a number's part shows at in its studio row, where it fills the row whatever its span: a slider one cell
 * high. A part lifted from the row takes the span its name and value need (`namedSliderSpan`).
 */
const studioPartSpan: Span = { columns: 6, rows: 1 };

/**
 * The span the pen pressure curve's part shows at on the studio's Pen page: a large graph with its name and buttons
 * above it, at least 380 by 316 CSS pixels at the default cell.
 */
const studioCurveSpan: Span = { columns: 12, rows: 10 };
