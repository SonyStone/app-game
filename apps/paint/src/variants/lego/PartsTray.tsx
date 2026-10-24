import { createEventListener } from '@solid-primitives/event-listener';
import { createSignal, For, onCleanup, Show } from 'solid-js';
import { cellGap, cellSize, partsBounds, pitch, type Part } from './board';
import type { createSheet } from './createSheet';
import type { createKits, Kit } from './kits';
import styles from './LegoStudio.module.css';
import { boxSections, kindLabel, lookOf, PartView, type Session } from './parts';

/**
 * The box of parts while editing, a sheet pulled up from the bottom edge (see `createSheet`): a wheel turned over the
 * board or the sheet moves its edge, as does a drag on its handle, and a tap on the handle opens or closes it. It
 * holds the workbench, where the board puts its bench plate to lay parts out at full size, beside every part by
 * family with its name, the brushes, and the kits as live previews, the user's with a delete button and a name to
 * tap and rename (the workbench above them in a narrow view). A part or group dropped on the kits is kept as one. While it is sunk, the strip it leaves puts away what is dropped on it.
 */
export function PartsTray(props: {
  session: Session;
  kits: ReturnType<typeof createKits>;
  sheet: ReturnType<typeof createSheet>;
  /** Whether a part or kit carried over the sheet would be put away there. */
  over: boolean;
  /** Lifts a new part of `kind`, or a copy of `kit`, from the press `event`. */
  onLift: (event: PointerEvent, kind: string) => void;
  onLiftKit: (event: PointerEvent, kit: Kit) => void;
  onReset: () => void;
  ref: (element: HTMLElement) => void;
  /** The workbench's place in the sheet. */
  benchRef: (element: HTMLElement) => void;
  /** The kits, where a part or group from the board or the workbench is dropped to be kept as a kit. */
  kitsRef: (element: HTMLElement) => void;
  /** Whether something carried over the kits would be kept as one. */
  overKits: boolean;
}) {
  const [body, setBody] = createSignal<HTMLElement>();
  const closed = () => props.sheet.height() <= 0 && !props.sheet.sunk();
  const shownHeight = () => (props.sheet.sunk() ? sunkHeight : Math.max(barHeight, props.sheet.height()));

  // A wheel over the board or the sheet moves its edge, and settles it once the wheel stops; over the parts it first
  // scrolls them, and moves the sheet only past their ends.
  let wheelTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(wheelTimer));
  createEventListener(
    window,
    'wheel',
    (event) => {
      const target = event.target instanceof Element ? event.target : undefined;
      if (event.ctrlKey || !target?.closest(`.${styles.board}, .${styles.tray}`)) {
        return;
      }

      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      const list = body();
      if (list?.contains(target)) {
        const atTop = list.scrollTop <= 0;
        const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 1;
        if (!(delta < 0 && atTop) && !(delta > 0 && atBottom)) {
          return;
        }
      }

      event.preventDefault();
      props.sheet.follow(props.sheet.height() + delta);
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => props.sheet.settle(delta > 0 ? 1 : -1), wheelSettle);
    },
    { passive: false }
  );

  return (
    <aside
      ref={props.ref}
      class={styles.tray}
      aria-label="Box of parts"
      data-closed={closed() ? '' : undefined}
      data-sunk={props.sheet.sunk() ? '' : undefined}
      data-over={props.over ? '' : undefined}
      data-keeps-panel
      style={{ height: `${shownHeight()}px` }}
    >
      <div class={styles.trayBar} onPointerDown={(event) => dragSheet(event, props.sheet)}>
        <span class={styles.trayGrip} aria-hidden="true" />
        <Show when={props.sheet.sunk()}>
          <span class={styles.trayTitle}>{props.over ? 'Drop to put it away' : 'Drop here to put it away'}</span>
        </Show>
      </div>
      <div class={styles.trayContent}>
        <div ref={props.benchRef} class={styles.benchSlot} />
        <div ref={setBody} class={styles.trayBody}>
          <For each={partFamilies(props.session)}>
            {(family) => (
              <section>
                <h4>{family.title}</h4>
                <div class={styles.trayItems}>
                  <For each={family.kinds}>
                    {(kind) => (
                      <PartTile kind={kind} session={props.session} onLift={(event) => props.onLift(event, kind)} />
                    )}
                  </For>
                </div>
              </section>
            )}
          </For>
          <section ref={props.kitsRef} class={styles.kitShelf} data-over={props.overKits ? '' : undefined}>
            <h4>{props.overKits ? 'Drop to keep as a kit' : 'Kits'}</h4>
            <div class={styles.trayItems}>
              <For each={props.kits.kits()}>
                {(kit) => (
                  <KitTile
                    kit={kit}
                    kits={props.kits}
                    session={props.session}
                    onLift={(event) => props.onLiftKit(event, kit)}
                  />
                )}
              </For>
            </div>
          </section>
          <button type="button" class={styles.boxButton} onClick={() => props.onReset()}>
            Reset board
          </button>
        </div>
      </div>
    </aside>
  );
}

/**
 * Moves the sheet's edge with the press `event` on its handle until it lifts, then settles it the way it was flung,
 * or on the nearest stop. A press that does not move opens a closed sheet to the middle and closes an open one.
 */
function dragSheet(event: PointerEvent, sheet: ReturnType<typeof createSheet>) {
  const element = event.currentTarget as HTMLElement;
  element.setPointerCapture(event.pointerId);
  const start = { y: event.clientY, height: sheet.height() };
  let last = { y: event.clientY, time: event.timeStamp };
  let speed = 0;
  let moved = false;

  const move = (next: PointerEvent) => {
    if (next.pointerId !== event.pointerId) {
      return;
    }

    moved ||= Math.abs(next.clientY - start.y) >= tapDistance;
    if (moved) {
      sheet.follow(start.height + start.y - next.clientY);
    }

    const time = Math.max(1, next.timeStamp - last.time);
    speed = (last.y - next.clientY) / time;
    last = { y: next.clientY, time: next.timeStamp };
  };
  const end = (next: PointerEvent) => {
    if (next.pointerId !== event.pointerId) {
      return;
    }

    element.removeEventListener('pointermove', move);
    element.removeEventListener('pointerup', end);
    element.removeEventListener('pointercancel', end);
    if (!moved) {
      sheet.to(sheet.height() > 0 ? 'closed' : 'middle');
      return;
    }

    sheet.settle(speed > flingSpeed ? 1 : speed < -flingSpeed ? -1 : 0);
  };
  element.addEventListener('pointermove', move);
  element.addEventListener('pointerup', end);
  element.addEventListener('pointercancel', end);
}

/** CSS pixels of the handle a closed sheet shows, and of the strip a sunk one leaves. */
const barHeight = 24;
const sunkHeight = 56;

/** CSS pixels a press on the handle may move and still be a tap. */
const tapDistance = 6;

/** CSS pixels per millisecond a drag must end at to fling the sheet to the next stop rather than the nearest. */
const flingSpeed = 0.3;

/** Milliseconds after the last wheel turn the sheet settles on a stop. */
const wheelSettle = 160;

/** The families of parts the box and the spawn menu offer: the box's sections, then the user's brushes. */
export function partFamilies(session: Session) {
  const brushes = session.library.presets().map((preset) => `preset:${preset.id}`);
  return [...boxSections, { title: 'Brushes', kinds: brushes }];
}

/** A part of `kind` as the box shows it: a one-cell sample with its name below; a press lifts a new one. */
export function PartTile(props: { kind: string; session: Session; onLift: (event: PointerEvent) => void }) {
  return (
    <div class={styles.trayItem}>
      <div class={styles.trayTile} title={kindLabel(props.kind, props.session)} onPointerDown={(event) => props.onLift(event)}>
        <div class={styles.content} inert>
          <PartView kind={props.kind} span={{ columns: 1, rows: 1 }} session={props.session} onPopup={() => {}} />
        </div>
      </div>
      <span class={styles.trayCaption}>{kindLabel(props.kind, props.session)}</span>
    </div>
  );
}

/**
 * A kit as the box shows it: its parts in miniature, at most `cells` cells across (three by default), with its
 * name; the user's own kits have a delete button. A press lifts a copy.
 */
export function KitTile(props: {
  kit: Kit;
  kits: ReturnType<typeof createKits>;
  session: Session;
  cells?: number;
  onLift: (event: PointerEvent) => void;
}) {
  return (
    <div class={styles.trayItem}>
      <div class={styles.kitPreview} title={`Kit: ${props.kit.name}`} onPointerDown={(event) => props.onLift(event)}>
        <KitPreview parts={props.kit.parts} session={props.session} cells={props.cells ?? 3} />
        <Show when={props.kits.isSaved(props.kit.id)}>
          <button
            type="button"
            class={styles.kitRemove}
            aria-label={`Delete kit ${props.kit.name}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => props.kits.remove(props.kit.id)}
          >
            ×
          </button>
        </Show>
      </div>
      <Show when={props.kits.isSaved(props.kit.id)} fallback={<span class={styles.trayCaption}>{props.kit.name}</span>}>
        <KitName name={props.kit.name} onRename={(name) => props.kits.rename(props.kit.id, name)} />
      </Show>
    </div>
  );
}

/** A kit of the user's name, which a tap turns into a field to rename it; Enter or leaving it keeps the name. */
function KitName(props: { name: string; onRename: (name: string) => void }) {
  const [editing, setEditing] = createSignal(false);
  const keep = (field: HTMLInputElement) => {
    const name = field.value.trim();
    setEditing(false);
    if (name && name !== props.name) {
      props.onRename(name);
    }
  };

  return (
    <Show
      when={editing()}
      fallback={
        <button type="button" class={[styles.trayCaption, styles.kitName]} title="Rename" onClick={() => setEditing(true)}>
          {props.name}
        </button>
      }
    >
      <input
        ref={(field) => queueMicrotask(() => field.select())}
        class={styles.kitNameField}
        value={props.name}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            keep(event.currentTarget);
          }

          if (event.key === 'Escape') {
            event.stopPropagation();
            setEditing(false);
          }
        }}
        onBlur={(event) => keep(event.currentTarget)}
      />
    </Show>
  );
}

/**
 * A kit's parts laid out as on a panel at full size, the block being carried; see `KitPreview` for the box's
 * miniature.
 */
export function BlockView(props: { parts: readonly Part[]; session: Session }) {
  const bounds = () => partsBounds(props.parts);

  return (
    <For each={props.parts}>
      {(part) => (
        <div
          class={styles.part}
          style={{
            left: `${(part.cell.column - bounds().column) * pitch}px`,
            top: `${(part.cell.row - bounds().row) * pitch}px`,
            width: `${part.span.columns * pitch - cellGap}px`,
            height: `${part.span.rows * pitch - cellGap}px`
          }}
        >
          <div class={styles.content} inert>
            <PartView kind={part.kind} span={part.span} look={lookOf(part)} session={props.session} onPopup={() => {}} />
          </div>
        </div>
      )}
    </For>
  );
}

/** A kit scaled down to at most `cells` cells either way, on a plate like a panel's. */
function KitPreview(props: { parts: readonly Part[]; session: Session; cells: number }) {
  const size = () => {
    const bounds = partsBounds(props.parts);
    return { width: bounds.columns * pitch - cellGap, height: bounds.rows * pitch - cellGap };
  };
  const scale = () => Math.min(1, (props.cells * cellSize) / size().width, (props.cells * cellSize) / size().height);

  return (
    <div
      class={styles.kitPlate}
      style={{ width: `${size().width * scale() + 8}px`, height: `${size().height * scale() + 8}px` }}
    >
      <div
        class={styles.kitScaled}
        style={{ width: `${size().width}px`, height: `${size().height}px`, scale: `${scale()}` }}
        inert
      >
        <BlockView parts={props.parts} session={props.session} />
      </div>
    </div>
  );
}
