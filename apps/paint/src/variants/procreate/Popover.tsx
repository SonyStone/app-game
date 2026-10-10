import { createEventListener } from '@solid-primitives/event-listener';
import type { JSX } from '@solidjs/web';
import { createSignal } from 'solid-js';
import styles from './Popover.module.css';
import { placePopover } from './placePopover';

/**
 * A Procreate popover: a dark rounded card under the toolbar button that opened it, with a small arrow pointing at
 * the button. It is centered under the button and kept inside the window, and its content scrolls when the window is
 * too short. Placement follows window resizes; the button must stay in place while the popover is open. Closing is up
 * to the caller (see `data-popover`, which marks the card for outside-press checks).
 */
export function Popover(props: {
  /** The button the popover belongs to. */
  anchor: HTMLElement;
  /** The card's width in CSS pixels, narrowed on small windows. */
  width: number;
  /** Accessible name of the popover. */
  label: string;
  class?: string;
  children: JSX.Element;
}) {
  const [view, setView] = createSignal(windowSize());
  createEventListener(window, 'resize', () => setView(windowSize()));
  const placement = () => {
    const rect = props.anchor.getBoundingClientRect();
    return placePopover(rect, props.width, view());
  };

  return (
    <section
      class={[styles.popover, props.class]}
      role="dialog"
      aria-label={props.label}
      data-popover
      style={{
        left: `${placement().left}px`,
        top: `${placement().top}px`,
        width: `${placement().width}px`,
        'max-height': `${placement().maxHeight}px`,
        '--arrow': `${placement().arrow}px`
      }}
    >
      <span class={styles.arrow} aria-hidden="true" />
      <div class={styles.body}>{props.children}</div>
    </section>
  );
}

/** A popover's title row: the title on the left, optional controls on the right. */
export function PopoverHeader(props: { title: string; children?: JSX.Element }) {
  return (
    <header class={styles.header}>
      <h2>{props.title}</h2>
      {props.children}
    </header>
  );
}

function windowSize() {
  return { width: innerWidth, height: innerHeight };
}
