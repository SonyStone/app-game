import { For } from 'solid-js';
import styles from './StrokeColorStrip.module.css';
import type { Vec4 } from '../../shared/vector';
import { colorOptions, sameVec4 } from '../shared/color';

type StrokeColorStripProps = {
  activeStrokeColor: Vec4;
  onSetStrokeColor: (strokeColor: Vec4) => void;
};

export function StrokeColorStrip(props: StrokeColorStripProps) {
  return (
    <div class={styles.colorStrip}>
      <For each={colorOptions}>
        {(color) => (
          <button
            class={`${styles.colorSwatch} ${sameVec4(props.activeStrokeColor, color.value) ? styles.colorSwatchActive : ''}`}
            style={{ 'background-color': color.swatch }}
            type="button"
            title={color.name}
            aria-label={color.name}
            aria-pressed={sameVec4(props.activeStrokeColor, color.value) ? 'true' : 'false'}
            onClick={() => props.onSetStrokeColor(color.value)}
          />
        )}
      </For>
    </div>
  );
}
