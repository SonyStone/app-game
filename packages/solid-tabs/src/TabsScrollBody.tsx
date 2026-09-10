import type { JSX } from '@solidjs/web';
import styles from './TabsScrollBody.module.css';

/** Keeps its final content reachable behind an overlaid TabsFooter. */
export function TabsScrollBody(props: { children: JSX.Element; class?: string }) {
  return (
    <div data-tabs-scroll-body="" class={`${styles.scrollBody} ${props.class ?? ''}`}>
      {props.children}
    </div>
  );
}
