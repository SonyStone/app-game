import { For, Show } from 'solid-js';
import { cellGap, cellSize, partsBounds, pitch, type Part } from './board';
import type { createKits, Kit } from './kits';
import styles from './LegoStudio.module.css';
import { boxSections, kindLabel, lookOf, PartView, type Session } from './parts';

/**
 * How far the box of parts is pulled out: `closed` leaves only its handle, the board at full size; `half` shrinks the
 * drawing to a card beside the box to look through it; `full` covers the screen with the workbench over the parts.
 */
export type TrayStop = 'closed' | 'half' | 'full';

/**
 * The box of parts while editing, pulled out in three stops (see `TrayStop`) by its handle, a tap or a swipe: every
 * part by family with its name, the brushes, and the kits as live previews, the user's with a delete button. Fully
 * pulled out it holds the workbench, a place the board puts its bench panel to build a kit at full size. While
 * something is carried from the board or the half-open box it sinks to a strip along the bottom, so the board shows
 * at full size; dropping something on it puts it away.
 */
export function PartsTray(props: {
  session: Session;
  kits: ReturnType<typeof createKits>;
  stop: TrayStop;
  onStop: (stop: TrayStop) => void;
  /** Whether a part or kit is being carried, and whether it is over the box, to be put away. */
  carrying: boolean;
  over: boolean;
  /** Lifts a new part of `kind`, or a copy of `kit`, from the press `event`. */
  onLift: (event: PointerEvent, kind: string) => void;
  onLiftKit: (event: PointerEvent, kit: Kit) => void;
  onReset: () => void;
  ref: (element: HTMLElement) => void;
  /** The workbench's place, shown while the box is fully out. */
  benchRef: (element: HTMLElement | undefined) => void;
}) {
  /** Where a press on the handle began, to tell a swipe from a tap. */
  let pressY: number | undefined;
  const sunk = () => props.carrying && props.stop !== 'full';
  const pull = (moved: number) => {
    const order: TrayStop[] = ['closed', 'half', 'full'];
    const at = order.indexOf(props.stop);
    if (Math.abs(moved) < swipeDistance) {
      return props.stop === 'closed' ? 'half' : props.stop === 'half' ? 'closed' : 'half';
    }

    return order[Math.max(0, Math.min(2, at + (moved < 0 ? 1 : -1)))]!;
  };

  return (
    <aside
      ref={props.ref}
      class={styles.tray}
      aria-label="Box of parts"
      data-stop={props.stop}
      data-sunk={sunk() ? '' : undefined}
      data-over={props.over ? '' : undefined}
      data-keeps-panel
    >
      <header
        class={styles.trayBar}
        onPointerDown={(event) => {
          // Held, so a swipe that leaves the handle still ends on it.
          event.currentTarget.setPointerCapture(event.pointerId);
          pressY = event.clientY;
        }}
        onPointerUp={(event) => {
          if (pressY === undefined || props.carrying) {
            return;
          }

          const moved = event.clientY - pressY;
          pressY = undefined;
          props.onStop(pull(moved));
        }}
      >
        <span class={styles.trayGrip} aria-hidden="true" />
        <span class={styles.trayTitle}>
          {props.over ? 'Drop to put it away' : sunk() ? 'Drop here to put it away' : 'Box of parts'}
        </span>
        <Show when={props.stop !== 'closed' && !sunk()}>
          <span class={styles.trayHint}>
            {props.stop === 'full' ? 'build a kit on the bench, drag it out by its rim' : 'or hold the drawing'}
          </span>
          <button
            type="button"
            class={styles.boxButton}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onClick={() => props.onStop(props.stop === 'full' ? 'half' : 'full')}
          >
            {props.stop === 'full' ? 'Back to the board' : 'Workbench'}
          </button>
          <button
            type="button"
            class={styles.boxButton}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onClick={() => props.onReset()}
          >
            Reset board
          </button>
        </Show>
      </header>
      <Show when={props.stop === 'full'}>
        <div ref={props.benchRef} class={styles.benchSlot}>
          <span>Workbench: drop parts here to build a kit at full size</span>
        </div>
      </Show>
      <div class={styles.trayBody}>
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
        <section>
          <h4>Kits</h4>
          <div class={styles.trayItems}>
            <For each={props.kits.kits()}>
              {(kit) => (
                <KitTile kit={kit} kits={props.kits} session={props.session} onLift={(event) => props.onLiftKit(event, kit)} />
              )}
            </For>
          </div>
        </section>
      </div>
    </aside>
  );
}

/** CSS pixels a press on the handle must travel to pull the box a stop further or push it back one. */
const swipeDistance = 24;

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
      <span class={styles.trayCaption}>{props.kit.name}</span>
    </div>
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
