import type { JSX } from '@solidjs/web';
import styles from './SquareGrid.module.css';

/** Square grid cells share one width-derived unit. Override --grid-columns at responsive breakpoints. */
export function SquareGrid(props: { children: JSX.Element; class?: string; columns?: number; rows?: number }) {
  return (
    <div
      data-square-grid=""
      class={`${styles.squareGrid} ${props.class ?? ''}`}
      style={{
        '--grid-default-columns': props.columns ?? 12,
        '--grid-default-rows': props.rows ?? 12
      }}
    >
      {props.children}
    </div>
  );
}
