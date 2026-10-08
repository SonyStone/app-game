import { createSignal, For, Show } from 'solid-js';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import styles from './mockup.module.css';
import { polar, PuckRing } from './PuckRing';
import {
  insertAction,
  moveBoundary,
  removeSector,
  ringActions,
  sectorAngles,
  sectorIndexAt,
  swapActions,
  type createRingLayout,
  type RingAction
} from './ringLayout';

/**
 * A drag-and-drop editor for the Puck ring, over the canvas:
 *
 * - drag a function from the list onto the ring to add it: it splits the sector it lands on;
 * - drag a sector onto another to swap their functions, or off the ring (outside it or into the dead circle) to
 *   remove it, giving its span to its neighbour;
 * - drag the dots on the ring's edge to move a boundary, resizing the two sectors beside it.
 *
 * Changes apply at once and persist with the layout.
 */
export function RingEditor(props: { ring: ReturnType<typeof createRingLayout>; onClose: () => void }) {
  let ringBox: HTMLDivElement | undefined;
  /** The function or sector being dragged, and where the pointer is. */
  const [dragging, setDragging] = createSignal<{
    from: { action: RingAction } | { sector: number };
    x: number;
    y: number;
    moved: boolean;
  }>();
  const used = () => new Set(props.ring.layout().sectors.map((sector) => sector.action));
  const layout = () => props.ring.layout();

  /** The pointer relative to the ring's center: radius and screen angle in degrees. */
  const relative = (event: PointerEvent) => {
    const box = ringBox!.getBoundingClientRect();
    const x = event.clientX - (box.left + box.width / 2),
      y = event.clientY - (box.top + box.height / 2);
    return { radius: Math.hypot(x, y), angle: (Math.atan2(y, x) * 180) / Math.PI };
  };
  const startDrag = (from: { action: RingAction } | { sector: number }, event: PointerEvent) => {
    event.preventDefault();
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    setDragging({ from, x: event.clientX, y: event.clientY, moved: false });
  };
  const moveDrag = (event: PointerEvent) => {
    const current = dragging();
    if (current) {
      const moved = current.moved || Math.hypot(event.clientX - current.x, event.clientY - current.y) > 6;
      setDragging({ ...current, x: event.clientX, y: event.clientY, moved });
    }
  };
  const drop = (event: PointerEvent) => {
    const current = dragging();
    setDragging(undefined);
    if (!current?.moved) {
      return;
    }

    const { radius, angle } = relative(event);
    const onRing = radius >= inner && radius <= outer + dropSlack;
    if ('action' in current.from) {
      if (onRing || radius < inner) {
        props.ring.set(insertAction(layout(), current.from.action, angle));
      }

      return;
    }

    if (onRing) {
      props.ring.set(swapActions(layout(), current.from.sector, sectorIndexAt(layout(), angle)));
    } else {
      props.ring.set(removeSector(layout(), current.from.sector));
    }
  };

  return (
    <div class={styles.ringEditor} data-cluster-ui onPointerMove={moveDrag} onPointerUp={drop}>
      <div class={styles.ringEditorPanel}>
        <h3>Ring editor</h3>
        <p>
          Drag a function onto the ring to add it. Drag a sector onto another to swap, or off the ring to remove it.
          Drag the dots to resize.
        </p>
        <div class={styles.ringPalette}>
          <For each={Object.keys(ringActions) as RingAction[]}>
            {(action) => (
              <button
                class={styles.ringChip}
                disabled={used().has(action)}
                onPointerDown={(event) => startDrag({ action }, event)}
              >
                <SketchIcon name={ringActions[action].icon} size={16} />
                {ringActions[action].label}
                <small>{ringActions[action].kind}</small>
              </button>
            )}
          </For>
        </div>
        <div class={styles.ringEditorActions}>
          <button onClick={() => props.ring.reset()}>Reset</button>
          <button onClick={() => props.onClose()}>Done</button>
        </div>
      </div>
      <div class={styles.ringEditorStage}>
        <div ref={(element) => (ringBox = element)} class={styles.ringEditorRing}>
          <PuckRing
            layout={layout()}
            inner={inner}
            outer={outer}
            onSectorDown={(index, event) => startDrag({ sector: index }, event)}
          />
          {/* Keyed by position, so that a handle keeps its element, and the press it captured, while it resizes. */}
          <For each={sectorAngles(layout())} keyed={false}>
            {(sector, index) => {
              const spot = () => polar(sector().from, outer + 10);
              return (
                <span
                  class={styles.ringHandle}
                  style={{ left: `${outer + 10 + spot().x}px`, top: `${outer + 10 + spot().y}px` }}
                  title="Drag to resize the sectors beside it"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={(event) => {
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                      props.ring.set(moveBoundary(layout(), index, relative(event).angle));
                    }
                  }}
                />
              );
            }}
          </For>
        </div>
      </div>
      <Show when={dragging()?.moved && dragging()}>
        {(current) => {
          const action = () =>
            'action' in current().from
              ? (current().from as { action: RingAction }).action
              : layout().sectors[(current().from as { sector: number }).sector]?.action;
          return (
            <span class={styles.ringGhost} style={{ left: `${current().x}px`, top: `${current().y}px` }}>
              <Show when={action()}>{(name) => <SketchIcon name={ringActions[name()].icon} size={20} />}</Show>
            </span>
          );
        }}
      </Show>
    </div>
  );
}

/** The editor's ring: large enough to aim at with a pen. */
const inner = 70;
const outer = 190;
/** CSS pixels past the ring's edge that still count as dropping on it. */
const dropSlack = 40;
