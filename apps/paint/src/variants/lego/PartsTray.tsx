import { For, Show } from 'solid-js';
import { cellGap, cellSize, partsBounds, pitch, type Part } from './board';
import type { createKits, Kit } from './kits';
import styles from './LegoStudio.module.css';
import { boxSections, kindLabel, lookOf, PartView, type Session } from './parts';

/**
 * The box of parts, docked beside the drawing while editing, in the room the drawing leaves as it shrinks to a card,
 * like Android's home screen while its widgets are arranged: every part by family with its name, the brushes, and
 * the kits as live previews, the user's with a delete button. Dropping something on it puts it away.
 */
export function PartsTray(props: {
  session: Session;
  kits: ReturnType<typeof createKits>;
  /** Whether a part or kit is being carried over the tray, to be put away. */
  over: boolean;
  /** Lifts a new part of `kind`, or a copy of `kit`, from the press `event`. */
  onLift: (event: PointerEvent, kind: string) => void;
  onLiftKit: (event: PointerEvent, kit: Kit) => void;
  onReset: () => void;
  ref: (element: HTMLElement) => void;
}) {
  return (
    <aside
      ref={props.ref}
      class={styles.tray}
      aria-label="Box of parts"
      data-over={props.over ? '' : undefined}
      data-keeps-panel
    >
      <header class={styles.trayBar}>
        <span class={styles.trayTitle}>{props.over ? 'Drop to put it away' : 'Box of parts'}</span>
        <span class={styles.trayHint}>or hold the drawing</span>
        <button type="button" class={styles.boxButton} onClick={() => props.onReset()}>
          Reset board
        </button>
      </header>
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
