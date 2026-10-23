import { createEventListener } from '@solid-primitives/event-listener';
import { createSignal, Match, Show, Switch } from 'solid-js';
import type { PaintVariantProps } from '..';
import {
  createPaintSession,
  PaintEditor,
  PaintStage,
  SessionNotices,
  StageGuides,
  StageOverlays
} from '../../features/session';
import { BoardView } from './BoardView';
import { createBoard } from './createBoard';
import styles from './LegoStudio.module.css';
import { pitch } from './board';
import { ColorDiscFor, ValuePart, type Popup } from './parts';

/**
 * The LEGO variant, a prototype of a UI built like printed LEGO tiles: panels lie freely on the drawing, each a plate
 * of studs, and parts sit on the studs in any whole number of cells. A part shows more the larger it is, like an
 * Android widget: a brush is a stroke sample, then gets its name, then a large sample; a value is a knob that opens a
 * slider, then a slider itself. Parts never overlap; placing or growing one pushes the others aside, and that is how
 * a panel grows. Only popups float over them.
 *
 * "Edit" shows the studs and the box of parts: drag parts out of the box, between panels and back, size them by
 * their corner and move panels by their rim (see `BoardView`). The board is kept per device.
 */
export function LegoStudio(props: PaintVariantProps) {
  const [editing, setEditing] = createSignal(false);
  const [popup, setPopup] = createSignal<{ popup: Popup; rect: DOMRect }>();
  const [popupElement, setPopupElement] = createSignal<HTMLElement>();
  const session = createPaintSession({ panel: () => popup()?.popup.kind });
  const board = createBoard();

  session.createShortcuts({
    closePanel() {
      if (popup()) {
        setPopup(undefined);
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

    const size = open.popup.kind === 'color' ? { width: 232, height: 232 } : { width: 5 * pitch + 8, height: 56 };
    return besideAnchor(open.rect, size, session.size());
  };

  return (
    <PaintEditor session={session} class={styles.editor}>
      <PaintStage session={session}>
        <StageGuides session={session} />
        <StageOverlays session={session} />
      </PaintStage>
      <div class={styles.ui}>
        <BoardView
          board={board}
          session={session}
          editing={editing()}
          onPopup={(anchor, next) => setPopup({ popup: next, rect: anchor.getBoundingClientRect() })}
        />
        <Show when={popup() && popupPlace()}>
          {(place) => (
            <div
              ref={setPopupElement}
              class={styles.popup}
              style={{ left: `${place().x}px`, top: `${place().y}px` }}
            >
              <Switch>
                <Match when={popup()?.popup.kind === 'color'}>
                  <ColorDiscFor session={session} />
                </Match>
                <Match when={popup()?.popup.kind === 'value' && popup()!.popup}>
                  {(open) => (
                    <div class={styles.popupSlider}>
                      <ValuePart
                        value={(open() as Extract<Popup, { kind: 'value' }>).value}
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
          <button
            type="button"
            class={styles.editButton}
            data-active={editing() ? '' : undefined}
            onClick={() => {
              setPopup(undefined);
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

/**
 * Where a popup of `size` goes beside the part at `anchor`: to its right, else its left, else below or above it, and
 * always inside `view`. Popups are the only things allowed over parts, but never over the part that opened them.
 */
function besideAnchor(anchor: DOMRect, size: { width: number; height: number }, view: { width: number; height: number }) {
  const gap = 10;
  const clampX = (x: number) => Math.max(4, Math.min(view.width - size.width - 4, x));
  const clampY = (y: number) => Math.max(4, Math.min(view.height - size.height - 4, y));
  const middleY = clampY(anchor.top + anchor.height / 2 - size.height / 2);

  if (anchor.right + gap + size.width <= view.width) {
    return { x: anchor.right + gap, y: middleY };
  }

  if (anchor.left - gap - size.width >= 0) {
    return { x: anchor.left - gap - size.width, y: middleY };
  }

  const x = clampX(anchor.left + anchor.width / 2 - size.width / 2);
  return anchor.bottom + gap + size.height <= view.height
    ? { x, y: anchor.bottom + gap }
    : { x, y: clampY(anchor.top - gap - size.height) };
}
