import { createEventListener } from '@solid-primitives/event-listener';
import { createElementSize } from '@solid-primitives/resize-observer';
import type { JSX } from '@solidjs/web';
import { createSignal } from 'solid-js';
import styles from './Anchored.module.css';

/**
 * A panel that Infinite Painter opens from a button, placed by the button and kept inside the window: `below` hangs
 * it under a top bar button with their right edges aligned (the tools and options menus), `beside` puts it to the
 * right of the main toolbar at the button's height (the color panel, brush selector and brush pop-ups), or to its
 * left when the toolbar sits at the screen's right edge. Placement follows the panel's size and window resizes; the
 * button must stay in place while the panel is open. Closing is up to the caller (`data-popover` marks the panel for
 * outside-press checks).
 */
export function Anchored(props: {
  anchor: HTMLElement;
  side: 'below' | 'beside';
  /** For `beside`: the element the panel keeps clear of, such as the whole toolbar; the anchor by default. */
  beside?: HTMLElement;
  children: JSX.Element;
}) {
  const [panel, setPanel] = createSignal<HTMLElement>();
  const [view, setView] = createSignal({ width: innerWidth, height: innerHeight });
  const size = createElementSize(panel);
  createEventListener(window, 'resize', () => setView({ width: innerWidth, height: innerHeight }));

  const place = () => {
    const anchor = props.anchor.getBoundingClientRect();
    const width = size.width ?? 0;
    const height = size.height ?? 0;
    const { width: viewWidth, height: viewHeight } = view();

    if (props.side === 'below') {
      return {
        left: clamp(anchor.right - width, margin, viewWidth - width - margin),
        top: anchor.bottom + gap
      };
    }

    const clear = (props.beside ?? props.anchor).getBoundingClientRect();
    const right = clear.right + gap + width <= viewWidth - margin;
    return {
      left: right ? clear.right + gap : clear.left - gap - width,
      top: clamp(anchor.top - 24, topLimit, viewHeight - height - margin)
    };
  };

  return (
    <div
      ref={setPanel}
      class={styles.anchored}
      data-popover
      style={{ left: `${place().left}px`, top: `${place().top}px` }}
    >
      {props.children}
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

/** CSS pixels between a panel and what it opens from. */
const gap = 6;

/** CSS pixels a panel keeps from the window's edges. */
const margin = 8;

/** The top bar's bottom, which panels beside the toolbar stay under. */
const topLimit = 52;
