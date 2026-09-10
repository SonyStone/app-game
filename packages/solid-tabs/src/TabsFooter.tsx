import type { JSX } from '@solidjs/web';
import styles from './TabsFooter.module.css';

/** Opaque bottom overlay; set --footer-height and --tabs-surface in the skin. */
export function TabsFooter(props: { children: JSX.Element; class?: string }) {
  return (
    <footer data-tabs-footer="" class={`${styles.footer} ${props.class ?? ''}`}>
      {props.children}
    </footer>
  );
}
