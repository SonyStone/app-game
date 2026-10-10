import { createElementSize } from '@solid-primitives/resize-observer';
import type { JSX } from '@solidjs/web';
import { createSignal } from 'solid-js';
import { placeSheet } from './fanLayout';
import type { Point, ViewSize } from './placement';
import styles from './ZenStudio.module.css';

/**
 * A quiet untitled card that opens from the pebble toward `inward`, beside the fan's nearest arc, and stays on
 * screen; it scrolls when taller than the view. Its own height, measured, decides where it goes.
 */
export function Sheet(props: {
  center: Point;
  inward: number;
  view: ViewSize;
  width: number;
  label: string;
  children: JSX.Element;
}) {
  const [element, setElement] = createSignal<HTMLElement>();
  // The layout height ignores the opening animation's scale, so the sheet does not drift while it grows.
  const size = createElementSize(element);
  const at = () =>
    placeSheet(props.center, props.inward, { width: props.width, height: size.clientHeight ?? 0 }, props.view, 104);

  return (
    <div
      ref={setElement}
      class={styles.sheet}
      role="dialog"
      aria-label={props.label}
      data-zen-ui=""
      style={{
        left: `${at().x}px`,
        top: `${at().y}px`,
        width: `${props.width}px`,
        'max-height': `${Math.max(120, props.view.height - 24)}px`
      }}
    >
      {props.children}
    </div>
  );
}
