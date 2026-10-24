import { createEventListener } from '@solid-primitives/event-listener';
import { createElementSize } from '@solid-primitives/resize-observer';
import { createSignal, Match, Show, Switch } from 'solid-js';
import type { PaintVariantProps } from '..';
import { LayersPanel } from '../../features/layers';
import {
  createPaintSession,
  PaintEditor,
  PaintStage,
  SessionNotices,
  StageGuides,
  StageOverlays
} from '../../features/session';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import { BrushLibrary } from '../procreate/BrushLibrary';
import popover from '../procreate/Popover.module.css';
import procreate from '../procreate/ProcreateStudio.module.css';
import { besideRect, findPart } from './board';
import { BoardView } from './BoardView';
import { createBoard } from './createBoard';
import { closedHeight, createSheet } from './createSheet';
import { createKits } from './kits';
import styles from './LegoStudio.module.css';
import { LookChooser } from './LookChooser';
import { chooseLook } from './looks';
import { ValuePart, type Popup } from './parts';

/**
 * The LEGO variant, a prototype of a UI built like printed LEGO tiles: panels lie freely on the drawing, each a plate
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
 */
export function LegoStudio(props: PaintVariantProps) {
  const [editing, setEditing] = createSignal(false);
  /** The swatch whose panel is open; see `BoardView`. */
  const [openPanel, setOpenPanel] = createSignal<string>();
  const [popup, setPopup] = createSignal<{ popup: Popup; rect: DOMRect }>();
  const [popupElement, setPopupElement] = createSignal<HTMLElement>();
  const popupSize = createElementSize(popupElement);
  const session = createPaintSession({ panel: () => popup()?.popup.kind });
  const board = createBoard();
  const kits = createKits();
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
    const up = editing() && !sheet.sunk() ? Math.max(closedHeight, sheet.height()) : 0;
    const progress = middle > 0 ? Math.min(up, middle) / middle : 0;
    const smallest = Math.max(0.3, (height - middle - cardMargin * 2) / height);
    const scale = 1 - progress * (1 - smallest);
    return { progress, scale, x: (width * (1 - scale)) / 2, y: cardMargin * progress };
  };

  session.createShortcuts({
    closePanel() {
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
    <PaintEditor
      session={session}
      class={`${styles.editor} ${card().progress > 0 ? styles.carded : ''}`}
      style={{
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
                      <Show when={findPart(board.board(), id())?.part}>
                        {(part) => (
                          <LookChooser
                            part={part()}
                            session={session}
                            onLook={(look) => board.set(chooseLook(board.latest(), id(), part().span, look))}
                          />
                        )}
                      </Show>
                    );
                  }}
                </Match>
                <Match when={popup()?.popup.kind === 'layers'}>
                  <div class={styles.studioCard}>
                    <LayersPanel
                      state={session.engine.state()}
                      ready={session.ready()}
                      onAction={(action) => session.edit({ type: 'layer', action })}
                      onLinearBlending={(linear) => session.edit({ type: 'blending', linear })}
                    />
                  </div>
                </Match>
                <Match when={popup()?.popup.kind === 'brushes'}>
                  <div class={procreate.editor}>
                    <section class={[popover.popover, styles.brushesCard]}>
                      <div class={popover.body}>
                        <BrushLibrary
                          title="Brushes"
                          presets={session.library.presets()}
                          recent={[session.tools.preset(), ...session.recentPresets.recent(7)]}
                          preset={session.tools.preset()}
                          disabled={!session.ready()}
                          onChoose={(id) => {
                            void session.usePreset(id);
                          }}
                        />
                      </div>
                    </section>
                  </div>
                </Match>
                <Match when={popup()?.popup.kind === 'note' && popup()!.popup}>
                  {(open) => <p class={styles.note}>{(open() as Extract<Popup, { kind: 'note' }>).text}</p>}
                </Match>
                <Match when={popup()?.popup.kind === 'value' && popup()!.popup}>
                  {(open) => (
                    <div class={styles.popupSlider}>
                      <ValuePart
                        value={(open() as Extract<Popup, { kind: 'value' }>).value}
                        look="slider"
                        span={{ columns: 5, rows: 1 }}
                        session={session}
                      />
                    </div>
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
          {/* On a tablet, full screen also hides Android's bars and makes its edge swipes take two tries. */}
          <button type="button" class={[styles.editButton, styles.iconButton]} {...session.fullscreen.props}>
            <SketchIcon name={session.fullscreen.isActive() ? 'fullscreenExit' : 'fullscreen'} size={18} />
          </button>
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
        <SessionNotices session={session} />
      </div>
    </PaintEditor>
  );
}

/** CSS pixels around the card the drawing shrinks to. */
const cardMargin = 16;
