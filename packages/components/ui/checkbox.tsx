import type { ComponentProps, JSX } from '@solidjs/web';
import { omit } from 'solid-js';
import styles from './controls.module.css';

/** Solid UI checkbox adapted to Solid 2's native input, with a 36px label hit area. */
export function Checkbox(props: Omit<ComponentProps<'input'>, 'type' | 'children'> & { children?: JSX.Element }): JSX.Element {
  const rest = omit(props, 'class', 'children');
  return <label class={[styles.checkbox, props.class]} data-ui-checkbox="">
    <input {...rest} type="checkbox" />
    <span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5l10 -10" /></svg></span>
    {props.children}
  </label>;
}
