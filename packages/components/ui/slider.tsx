import type { ComponentProps, JSX } from '@solidjs/web';
import { omit } from 'solid-js';
import styles from './controls.module.css';

/** Solid UI slider styling on a native range input; the full 36px track is interactive. */
export function Slider(props: Omit<ComponentProps<'input'>, 'type' | 'style'>): JSX.Element {
  const progress = () => Math.max(0, Math.min(100, (Number(props.value ?? props.defaultValue ?? props.min ?? 0) - Number(props.min ?? 0)) / Math.max(1, Number(props.max ?? 100) - Number(props.min ?? 0)) * 100));
  return <input {...omit(props, 'class')} type="range" style={{ '--ui-slider-progress': `${progress()}%` }} class={[styles.slider, props.class]} />;
}
