import { createEventListener } from '@solid-primitives/event-listener';
import type { JSX } from '@solidjs/web';
import { createSignal } from 'solid-js';
import styles from './FloatingWindow.module.css';
import { SketchIcon } from './SketchIcon';

/**
 * A window floating over the editor in its own look, neutral grey: a title bar and a close button over the content.
 * Dragging the title bar with the pen, the mouse or a finger moves the window; it stays where the title bar can be
 * reached again, however the page resizes. The window keeps no position of its own: `onMove` receives each new one,
 * and `done` once the drag ends, for remembering it.
 */
export function FloatingWindow(props: {
  title: string;
  /** The window's top-left corner in CSS pixels of the page. */
  position: { x: number; y: number };
  onMove: (position: { x: number; y: number }, done: boolean) => void;
  onClose: () => void;
  /** CSS pixels; the content decides the height. */
  width: number;
  class?: string;
  children: JSX.Element;
}) {
  const [size, setSize] = createSignal({ width: innerWidth, height: innerHeight });
  createEventListener(window, 'resize', () => setSize({ width: innerWidth, height: innerHeight }));
  /** The drag in progress: the pointer and where it grabbed the window, relative to the window's corner. */
  let drag: { id: number; dx: number; dy: number } | undefined;
  const place = (point: { x: number; y: number }) => ({
    x: clamp(point.x, reach - props.width, size().width - reach),
    y: clamp(point.y, 0, size().height - titleHeight)
  });
  const titleHandlers = {
    onPointerDown(event: PointerEvent & { currentTarget: HTMLElement }) {
      if (drag || (event.target as Element).closest('button') || (event.pointerType === 'mouse' && event.button)) {
        return;
      }

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      const corner = place(props.position);
      drag = { id: event.pointerId, dx: event.clientX - corner.x, dy: event.clientY - corner.y };
    },
    onPointerMove(event: PointerEvent) {
      if (drag?.id === event.pointerId) {
        props.onMove(place({ x: event.clientX - drag.dx, y: event.clientY - drag.dy }), false);
      }
    },
    onPointerUp(event: PointerEvent) {
      if (drag?.id === event.pointerId) {
        props.onMove(place({ x: event.clientX - drag.dx, y: event.clientY - drag.dy }), true);
        drag = undefined;
      }
    },
    onLostPointerCapture(event: PointerEvent) {
      if (drag?.id === event.pointerId) {
        drag = undefined;
        props.onMove(place(props.position), true);
      }
    }
  };

  return (
    <section
      class={`${styles.window} ${props.class ?? ''}`}
      role="dialog"
      aria-label={props.title}
      style={{
        left: `${place(props.position).x}px`,
        top: `${place(props.position).y}px`,
        width: `${props.width}px`
      }}
    >
      <header class={styles.title} {...titleHandlers}>
        <h2>{props.title}</h2>
        <button aria-label={`Close ${props.title}`} title="Close" onClick={() => props.onClose()}>
          <SketchIcon name="close" size={18} />
        </button>
      </header>
      <div class={styles.content}>{props.children}</div>
    </section>
  );
}

/** CSS pixels of the title bar, which stays on the page. */
const titleHeight = 40;

/** CSS pixels of the window that stay on the page sideways. */
const reach = 96;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
