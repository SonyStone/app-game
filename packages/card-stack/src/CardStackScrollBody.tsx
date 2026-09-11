import type { JSX } from '@solidjs/web';
import styles from './CardStackScrollBody.module.css';

/** Keeps its final content reachable behind an overlaid CardStackFooter. */
export function CardStackScrollBody(props: { children: JSX.Element; class?: string }) {
  return (
    <div data-tabs-scroll-body="" class={`${styles.scrollBody} ${props.class ?? ''}`}>
      {props.children}
    </div>
  );
}
