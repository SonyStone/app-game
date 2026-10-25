import { createEventListener } from '@solid-primitives/event-listener';
import { createEffect, createSignal, For, onCleanup, onSettled, Show } from 'solid-js';
import { cellGap, cellSize, partData, partsBounds, pitch, type Part } from './board';
import { closedHeight, type createSheet } from './createSheet';
import type { createKits, Kit } from './kits';
import type { LegoServices } from './LegoServices';
import styles from './LegoStudio.module.css';
import { boxSections, kindLabel, lookOf, PartView } from './parts';
import { opaqueData } from './partStorage';

/**
 * The box of parts while editing, a sheet pulled up from the bottom edge (see `createSheet`): a wheel turned over the
 * board or the sheet moves its edge, as does a drag on its handle, and a tap on the handle opens or closes it. It
 * holds the workbench, where the board puts its bench plate to lay parts out at full size, beside every part by
 * family with its name and the brushes, where a part dropped is put away, and apart from them the kits as live
 * previews, the user's with a delete button and a name to tap and rename, where a part, group or panel dropped is
 * kept as a kit (the workbench above both in a narrow view). While it is sunk, the strip it leaves puts away what is dropped on it.
 */
export function PartsTray(props: {
  presets: LegoServices['presets']['all'];
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
  benchRef: (element: HTMLElement | undefined) => void;
  /** The kits, where a part or group from the board or the workbench is dropped to be kept as a kit. */
  kitsRef: (element: HTMLElement | undefined) => void;
  /** Whether something carried over the kits would be kept as one. */
  overKits: boolean;
  /** The kit to light up and bring into view: one just kept, or the one a kept part or group matched. */
  flashKit: string | undefined;
}) {
  const [body, setBody] = createSignal<HTMLElement>();
  const [shelf, setShelf] = createSignal<HTMLElement>();
  const split = createSplit();
  const closed = () => props.sheet.height() <= 0 && !props.sheet.sunk();
  const shownHeight = () => (props.sheet.sunk() ? sunkHeight : Math.max(closedHeight, props.sheet.height()));

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
      const list = [body(), shelf()].find((element) => element?.contains(target));
      if (list) {
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
        <Show when={closed()}>
          <span class={styles.trayTitle}>Parts</span>
        </Show>
      </div>
      <Show when={props.sheet.height() > 0 && !props.sheet.sunk()}>
        <Contents />
      </Show>
    </aside>
  );

  /** Owns the sheet's mounted refs, clearing portals and hit targets when closed or sunk. */
  function Contents() {
    onSettled(() => () => {
      props.benchRef(undefined);
      props.kitsRef(undefined);
      setBody(undefined);
      setShelf(undefined);
    });

    return (
      <div
        class={styles.trayContent}
        style={{ '--shelf-width': `${split.shelf() * 100}%`, '--kits-height': `${split.kits() * 100}%` }}
      >
        <div ref={props.benchRef} class={styles.benchSlot} />
        <div
          class={styles.splitter}
          data-axis="x"
          aria-hidden="true"
          onPointerDown={(event) => split.drag(event, 'shelf')}
        />
        <div class={styles.trayShelves}>
          <div ref={setBody} class={styles.trayBody} data-over={props.over && !props.sheet.sunk() ? '' : undefined}>
            <span class={styles.zoneLabel}>{props.over ? 'Drop to put it away' : 'Parts'}</span>
            <For each={partFamilies(props.presets)} keyed={(family) => family.id}>
              {(family) => (
                <section>
                  <h4>{family().title}</h4>
                  <div class={styles.trayItems}>
                    <For each={family().kinds}>
                      {(kind) => (
                        <PartTile kind={kind} presets={props.presets} onLift={(event) => props.onLift(event, kind)} />
                      )}
                    </For>
                  </div>
                </section>
              )}
            </For>
            <button type="button" class={styles.boxButton} onClick={() => props.onReset()}>
              Reset board
            </button>
          </div>
          <div
            class={styles.splitter}
            data-axis="y"
            aria-hidden="true"
            onPointerDown={(event) => split.drag(event, 'kits')}
          />
          <div
            ref={(element) => {
              setShelf(element);
              props.kitsRef(element);
            }}
            class={styles.kitShelf}
            data-over={props.overKits ? '' : undefined}
          >
            <span class={styles.zoneLabel}>
              {props.overKits ? 'Drop to keep as a kit' : 'Kits · drop here to keep'}
            </span>
            <div class={styles.trayItems}>
              <For each={props.kits.kits()} keyed={(kit) => kit.id}>
                {(kit) => (
                  <KitTile
                    kit={kit()}
                    kits={props.kits}
                    flash={props.flashKit === kit().id}
                    onLift={(event) => props.onLiftKit(event, kit())}
                  />
                )}
              </For>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

/**
 * How the sheet's room is shared, kept on this device: `shelf` is the share of its width the parts and kits take
 * beside the workbench, `kits` the share of their height the kits take. A divider between them is dragged to change
 * a share, within bounds that leave each box some room.
 */
function createSplit() {
  const stored = readSplit();
  const [shelf, setShelf] = createSignal(stored.shelf);
  const [kits, setKits] = createSignal(stored.kits);

  return {
    shelf,
    kits,
    /** Follows the press `event` on the divider of `share` until it lifts, then keeps the shares. */
    drag(event: PointerEvent, share: 'shelf' | 'kits') {
      const divider = event.currentTarget as HTMLElement;
      const box = divider.parentElement!.getBoundingClientRect();
      divider.setPointerCapture(event.pointerId);
      event.preventDefault();

      const move = (next: PointerEvent) => {
        if (share === 'shelf') {
          setShelf(Math.max(0.2, Math.min(0.75, (box.right - next.clientX) / box.width)));
        } else {
          setKits(Math.max(0.15, Math.min(0.85, (box.bottom - next.clientY) / box.height)));
        }
      };
      const end = () => {
        divider.removeEventListener('pointermove', move);
        divider.removeEventListener('pointerup', end);
        divider.removeEventListener('pointercancel', end);
        try {
          localStorage.setItem(splitKey, JSON.stringify({ shelf: shelf(), kits: kits() }));
        } catch {
          // The shares still apply until the page closes.
        }
      };
      divider.addEventListener('pointermove', move);
      divider.addEventListener('pointerup', end);
      divider.addEventListener('pointercancel', end);
    }
  };
}

function readSplit() {
  const fallback = { shelf: 0.4, kits: 0.38 };
  try {
    const stored = JSON.parse(localStorage.getItem(splitKey) ?? 'null') as Partial<typeof fallback> | null;
    return {
      shelf: typeof stored?.shelf === 'number' ? stored.shelf : fallback.shelf,
      kits: typeof stored?.kits === 'number' ? stored.kits : fallback.kits
    };
  } catch {
    return fallback;
  }
}

const splitKey = 'paint.lego.tray';

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

/** CSS pixels of the strip a sunk sheet leaves. */
const sunkHeight = 56;

/** CSS pixels a press on the handle may move and still be a tap. */
const tapDistance = 6;

/** CSS pixels per millisecond a drag must end at to fling the sheet to the next stop rather than the nearest. */
const flingSpeed = 0.3;

/** Milliseconds after the last wheel turn the sheet settles on a stop. */
const wheelSettle = 160;

/** The families of parts the box and the spawn menu offer: the box's sections, then the user's brushes. */
export function partFamilies(presets: LegoServices['presets']['all']) {
  const brushes = presets().map((preset) => `preset:${preset.id}`);
  return [...boxSections, { id: 'Brushes', title: 'Brushes', kinds: brushes }];
}

/** A part of `kind` as the box shows it: a one-cell sample with its name below; a press lifts a new one. */
export function PartTile(props: {
  kind: string;
  presets: LegoServices['presets']['all'];
  onLift: (event: PointerEvent) => void;
}) {
  return (
    <div class={styles.trayItem}>
      <div
        class={styles.trayTile}
        title={kindLabel(props.kind, props.presets())}
        onPointerDown={(event) => props.onLift(event)}
      >
        <div class={styles.content} inert>
          <PartView mode="preview" kind={props.kind} span={{ columns: 1, rows: 1 }} onPopup={() => {}} />
        </div>
      </div>
      <span class={styles.trayCaption}>{kindLabel(props.kind, props.presets())}</span>
    </div>
  );
}

/**
 * A kit as the box shows it: its parts in miniature, at most `cells` cells across (three by default), with its
 * name; the user's own kits have a delete button. A press lifts a readable kit. Broken kits can only be removed.
 */
export function KitTile(props: {
  kit: Kit;
  kits: ReturnType<typeof createKits>;
  cells?: number;
  /** Lights the kit up and scrolls it into view. */
  flash?: boolean;
  onLift: (event: PointerEvent) => void;
}) {
  const broken = () => opaqueData in props.kit;
  const [tile, setTile] = createSignal<HTMLElement>();
  createEffect(
    () => (props.flash ? tile() : undefined),
    (element) => {
      element?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  );

  return (
    <div ref={setTile} class={styles.trayItem} data-flash={props.flash ? '' : undefined}>
      <div
        class={styles.kitPreview}
        data-broken={broken() ? '' : undefined}
        title={`${broken() ? 'Broken kit' : 'Kit'}: ${props.kit.name}`}
        onPointerDown={(event) => {
          if (!broken()) {
            props.onLift(event);
          }
        }}
      >
        <Show when={!broken()} fallback={<span class={styles.brokenKit}>Broken kit</span>}>
          <KitPreview parts={props.kit.parts} cells={props.cells ?? 3} />
        </Show>
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
      <Show
        when={props.kits.isSaved(props.kit.id) && !broken()}
        fallback={<span class={styles.trayCaption}>{props.kit.name}</span>}
      >
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
        <button
          type="button"
          class={[styles.trayCaption, styles.kitName]}
          title="Rename"
          onClick={() => setEditing(true)}
        >
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
export function BlockView(props: { parts: readonly Part[] }) {
  const bounds = () => partsBounds(props.parts);

  return (
    <For each={props.parts} keyed={(part) => part.id}>
      {(part) => (
        <div
          class={styles.part}
          style={{
            left: `${(part().cell.column - bounds().column) * pitch}px`,
            top: `${(part().cell.row - bounds().row) * pitch}px`,
            width: `${part().span.columns * pitch - cellGap}px`,
            height: `${part().span.rows * pitch - cellGap}px`
          }}
        >
          <div class={styles.content} inert>
            <PartView
              mode="preview"
              kind={part().kind}
              missing={!!part()[partData]?.invalid}
              span={part().span}
              look={lookOf(part())}
              onPopup={() => {}}
            />
          </div>
        </div>
      )}
    </For>
  );
}

/** A kit scaled down to at most `cells` cells either way, on a plate like a panel's. */
function KitPreview(props: { parts: readonly Part[]; cells: number }) {
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
        <BlockView parts={props.parts} />
      </div>
    </div>
  );
}
