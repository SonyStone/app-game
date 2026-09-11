import type { JSX } from '@solidjs/web';
import { createSignal } from 'solid-js';
import { createDragScroll } from './primitives/createDragScroll';
import styles from './CardStackViewport.module.css';

/** Native touch/wheel scrolling plus optional mouse/pen drag; geometry stays fixed while cards move. */
export function CardStackViewport(props: { children: JSX.Element; class?: string; label: string; scrollable?: boolean }) {
  const [element, setElement] = createSignal<HTMLDivElement>();
  createDragScroll(element, () => props.scrollable ?? true);
  return (
    <div
      data-tabs-viewport=""
      class={`${styles.viewport} ${props.class ?? ''}`}
      ref={setElement}
      tabindex={props.scrollable !== false ? 0 : undefined}
      aria-label={props.label}
    >
      {props.children}
    </div>
  );
}
