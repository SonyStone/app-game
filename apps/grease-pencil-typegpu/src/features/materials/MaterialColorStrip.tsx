import { For } from 'solid-js';
import styles from './MaterialColorStrip.module.css';
import type { Vec4 } from '../../shared/vector';
import { colorOptions, sameRgb, withAlpha } from '../shared/color';

type MaterialColorStripProps = {
  activeColor: Vec4;
  alpha: number;
  label: string;
  onSelectColor: (color: Vec4) => void;
};

export function MaterialColorStrip(props: MaterialColorStripProps) {
  return (
    <>
      <div class={styles.controlGroupLabel}>{props.label}</div>
      <div class={styles.fillColorStrip}>
        <For each={colorOptions}>
          {(color) => (
            <button
              class={`${styles.colorSwatch} ${
                sameRgb(props.activeColor, color.value) ? styles.colorSwatchActive : ''
              }`}
              style={{ 'background-color': color.swatch }}
              type="button"
              title={color.name}
              onClick={() => props.onSelectColor(withAlpha(color.value, props.alpha))}
            />
          )}
        </For>
      </div>
    </>
  );
}
