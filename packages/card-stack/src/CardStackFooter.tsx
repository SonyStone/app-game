import type { JSX } from '@solidjs/web';
import styles from './CardStackFooter.module.css';

/** Opaque footer, anchored to the deck bottom at rest and while its card is revealed.
 * Render for every card so covering sheets uncover it naturally. Set --footer-height and --tabs-surface in the skin. */
export function CardStackFooter(props: { children: JSX.Element; class?: string }) {
  return (
    <footer data-tabs-footer="" class={`${styles.footer} ${props.class ?? ''}`}>
      {props.children}
    </footer>
  );
}
