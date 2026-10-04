import styles from './ColorPickerLoupe.module.css';
import type { PickerPreview } from './createCanvasColorPicker';

/**
 * A ring around a held color pick, as in Procreate: the upper half shows the color under the contact, the lower half
 * the current color it would replace. A checkerboard stands for no paint, and the upper half is empty until the first
 * sample arrives. Large enough to stay visible around a fingertip.
 */
export function ColorPickerLoupe(props: { preview: PickerPreview }) {
  return (
    <div
      class={styles.loupe}
      role="status"
      aria-label={props.preview.color ? `Picking ${props.preview.color}` : 'Picking a color'}
      style={{ left: `${props.preview.point.x}px`, top: `${props.preview.point.y}px` }}
    >
      <div class={styles.ring}>
        <div
          class={styles.sampled}
          data-empty={props.preview.color === null ? 'true' : 'false'}
          style={{ background: props.preview.color ?? undefined }}
        />
        <div class={styles.current} style={{ background: props.preview.current }} />
      </div>
    </div>
  );
}
