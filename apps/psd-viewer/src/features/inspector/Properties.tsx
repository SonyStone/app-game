import type { JSX } from '@solidjs/web';
import { For } from 'solid-js';
import styles from './inspector.module.css';

/** A titled group of label–value rows. Rows whose value is `undefined` are left out. */
export function Properties(props: {
  title: string;
  rows: [string, JSX.Element | undefined][];
  children?: JSX.Element;
}) {
  return (
    <section class={styles.section} aria-label={props.title}>
      <h3>{props.title}</h3>
      <dl>
        <For each={props.rows.filter(([, value]) => value !== undefined)}>
          {([label, value]) => (
            <>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </>
          )}
        </For>
      </dl>
      {props.children}
    </section>
  );
}

/** A yes/no value. */
export function yesNo(value: boolean | undefined): string | undefined {
  return value === undefined ? undefined : value ? 'yes' : 'no';
}

/** A rectangle as Photoshop stores it, with its size. */
export function rectText(rect: { top: number; left: number; bottom: number; right: number }): string {
  return `${rect.left}, ${rect.top} – ${rect.right}, ${rect.bottom} (${rect.right - rect.left} × ${rect.bottom - rect.top})`;
}
