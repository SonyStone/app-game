import { For, Show } from 'solid-js';
import { cellGap, cellSize, partsBounds, pitch, type Part } from './board';
import type { createKits, Kit } from './kits';
import styles from './LegoStudio.module.css';
import { boxSections, kindLabel, lookOf, PartView, type Session } from './parts';

/**
 * The box of parts as a drawer pulled up from the bottom edge while editing, like a tray of bricks: every part by
 * family with its name, the brushes, and the kits as live previews, the user's with a delete button. Its bar opens
 * and closes it with a tap or a swipe. While something is being carried the drawer sinks to its bar, which then
 * takes what is dropped on it, so the board stays in view; a part taken from it leaves it closed, as Android's
 * widget picker does.
 */
export function PartsDrawer(props: {
  session: Session;
  kits: ReturnType<typeof createKits>;
  open: boolean;
  onOpen: (open: boolean) => void;
  /** Whether a part or kit is being carried, and whether it is over the drawer. */
  carrying: boolean;
  over: boolean;
  /** Lifts a new part of `kind`, or a copy of `kit`, from the press `event`. */
  onLift: (event: PointerEvent, kind: string) => void;
  onLiftKit: (event: PointerEvent, kit: Kit) => void;
  onReset: () => void;
  ref: (element: HTMLElement) => void;
}) {
  /** Where a press on the bar began, to tell a swipe from a tap. */
  let pressY: number | undefined;
  const presets = () => props.session.library.presets().map((preset) => `preset:${preset.id}`);

  return (
    <aside
      ref={props.ref}
      class={styles.drawer}
      aria-label="Box of parts"
      data-open={props.open && !props.carrying ? '' : undefined}
      data-carrying={props.carrying ? '' : undefined}
      data-over={props.over ? '' : undefined}
      data-keeps-panel
    >
      <div
        class={styles.drawerBar}
        onPointerDown={(event) => {
          pressY = event.clientY;
        }}
        onPointerUp={(event) => {
          if (pressY === undefined || props.carrying) {
            return;
          }

          const moved = event.clientY - pressY;
          pressY = undefined;
          props.onOpen(moved < -20 ? true : moved > 20 ? false : !props.open);
        }}
      >
        <span class={styles.drawerGrip} aria-hidden="true" />
        <span class={styles.drawerTitle}>
          {props.carrying ? 'Drop here to put it away' : props.open ? 'Box of parts' : 'Box of parts · pull up'}
        </span>
        <button
          type="button"
          class={styles.boxButton}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => props.onReset()}
        >
          Reset board
        </button>
      </div>
      <div class={styles.drawerBody}>
        <For each={[...boxSections, { title: 'Brushes', kinds: presets() }]}>
          {(section) => (
            <section>
              <h4>{section.title}</h4>
              <div class={styles.drawerItems}>
                <For each={section.kinds}>
                  {(kind) => (
                    <div class={styles.drawerItem}>
                      <div
                        class={styles.drawerTile}
                        title={kindLabel(kind, props.session)}
                        onPointerDown={(event) => props.onLift(event, kind)}
                      >
                        <div class={styles.content} inert>
                          <PartView
                            kind={kind}
                            span={{ columns: 1, rows: 1 }}
                            session={props.session}
                            onPopup={() => {}}
                          />
                        </div>
                      </div>
                      <span class={styles.drawerCaption}>{kindLabel(kind, props.session)}</span>
                    </div>
                  )}
                </For>
              </div>
            </section>
          )}
        </For>
        <section>
          <h4>Kits</h4>
          <div class={styles.drawerItems}>
            <For each={props.kits.kits()}>
              {(kit) => (
                <div class={styles.drawerItem}>
                  <div class={styles.kitPreview} title={`Kit: ${kit.name}`} onPointerDown={(event) => props.onLiftKit(event, kit)}>
                    <KitPreview parts={kit.parts} session={props.session} />
                    <Show when={props.kits.isSaved(kit.id)}>
                      <button
                        type="button"
                        class={styles.kitRemove}
                        aria-label={`Delete kit ${kit.name}`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => props.kits.remove(kit.id)}
                      >
                        ×
                      </button>
                    </Show>
                  </div>
                  <span class={styles.drawerCaption}>{kit.name}</span>
                </div>
              )}
            </For>
          </div>
        </section>
      </div>
    </aside>
  );
}

/**
 * A kit's parts laid out as on a panel at full size, the block being carried; see `KitPreview` for the drawer's
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

/** A kit scaled down to fit its place in the drawer, on a plate like a panel's. */
function KitPreview(props: { parts: readonly Part[]; session: Session }) {
  const size = () => {
    const bounds = partsBounds(props.parts);
    return { width: bounds.columns * pitch - cellGap, height: bounds.rows * pitch - cellGap };
  };
  const scale = () => Math.min(1, kitPreview.width / size().width, kitPreview.height / size().height);

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

/** The most room a kit's preview takes in the drawer, in CSS pixels; about three cells. */
const kitPreview = { width: 3 * cellSize, height: 3 * cellSize };
