import type { ComponentProps, JSX } from '@solidjs/web';
import { omit } from 'solid-js';
import styles from './controls.module.css';

/** Solid UI input styling with native validation and keyboard behavior on Solid 2. */
export function TextFieldInput(props: ComponentProps<'input'>): JSX.Element {
  return <input {...omit(props, 'class')} class={[styles.input, props.class]} />;
}
