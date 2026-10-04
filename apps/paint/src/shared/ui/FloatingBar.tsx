import type { JSX } from '@solidjs/web';
import styles from './FloatingBar.module.css';

/**
 * A compact toolbar of icon buttons floating over the canvas, such as the transform and selection actions. Place it
 * with `placeBeside`; `left` is its horizontal center. Children are buttons, `FloatingBarSeparator`s and, for
 * hints, text.
 */
export function FloatingBar(props: { placement: { left: number; top: number }; label: string; children: JSX.Element }) {
  return (
    <div
      class={styles.bar}
      style={{ left: `${props.placement.left}px`, top: `${props.placement.top}px` }}
      role="toolbar"
      aria-label={props.label}
    >
      {props.children}
    </div>
  );
}

/** A thin divider between groups of a `FloatingBar`. */
export function FloatingBarSeparator() {
  return <span class={styles.separator} />;
}

/** Class of a `FloatingBar` button that applies the bar's work, such as Done. */
export const floatingBarPrimary = styles.primary;
