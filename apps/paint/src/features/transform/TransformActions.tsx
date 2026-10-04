import type { JSX } from '@solidjs/web';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import type { TransformSettings } from './createTransform';
import styles from './Transform.module.css';

/**
 * Compact transform actions next to the box: flips, a quarter turn, the proportions and pixel-art settings, reset,
 * cancel and apply. Icons carry labels and tooltips.
 */
export function TransformActions(props: {
  /** Positions the bar; see `TransformOverlay`. */
  style: JSX.CSSProperties;
  settings: TransformSettings;
  onSettings: (patch: Partial<TransformSettings>) => void;
  onFlip: (axis: 'x' | 'y') => void;
  onRotate: () => void;
  onReset: () => void;
  onCancel: () => void;
  onDone: () => void;
}) {
  return (
    <div class={styles.actions} style={props.style} role="toolbar" aria-label="Transform actions">
      <button aria-label="Flip horizontal" title="Flip horizontal" onClick={() => props.onFlip('x')}>
        <SketchIcon name="mirror" size={20} />
      </button>
      <button aria-label="Flip vertical" title="Flip vertical" onClick={() => props.onFlip('y')}>
        <SketchIcon name="flipVertical" size={20} />
      </button>
      <button aria-label="Rotate 90°" title="Rotate 90° clockwise" onClick={() => props.onRotate()}>
        <SketchIcon name="rotate" size={20} />
      </button>
      <span class={styles.separator} />
      <button
        aria-label="Keep proportions"
        title="Keep proportions when scaling from a corner · Shift does the opposite"
        aria-pressed={props.settings.proportional ? 'true' : 'false'}
        onClick={() => props.onSettings({ proportional: !props.settings.proportional })}
      >
        <SketchIcon name="proportions" size={20} />
      </button>
      <button
        aria-label="Pixel art"
        title="Pixel art: keep hard pixel edges instead of smoothing"
        aria-pressed={props.settings.interpolation === 'pixels' ? 'true' : 'false'}
        onClick={() =>
          props.onSettings({ interpolation: props.settings.interpolation === 'pixels' ? 'smooth' : 'pixels' })
        }
      >
        <SketchIcon name="pixels" size={20} />
      </button>
      <span class={styles.separator} />
      <button aria-label="Reset" title="Reset to the original placement" onClick={() => props.onReset()}>
        <SketchIcon name="reset" size={20} />
      </button>
      <button aria-label="Cancel" title="Cancel · Escape" onClick={() => props.onCancel()}>
        <SketchIcon name="close" size={20} />
      </button>
      <button class={styles.done} aria-label="Done" title="Apply · Enter" onClick={() => props.onDone()}>
        <SketchIcon name="check" size={20} />
      </button>
    </div>
  );
}
