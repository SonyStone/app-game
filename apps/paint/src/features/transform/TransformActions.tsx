import { FloatingBar, FloatingBarSeparator, floatingBarPrimary } from '../../shared/ui/FloatingBar';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import type { TransformSettings } from './createTransform';

/**
 * Compact transform actions next to the box: flips, a quarter turn, the proportions and pixel-art settings, reset,
 * cancel and apply. Icons carry labels and tooltips.
 */
export function TransformActions(props: {
  /** Where the bar goes; see `placeBeside`. */
  placement: { left: number; top: number };
  settings: TransformSettings;
  onSettings: (patch: Partial<TransformSettings>) => void;
  onFlip: (axis: 'x' | 'y') => void;
  onRotate: () => void;
  /** Whether the box is distorted by its corners. */
  distorted: boolean;
  onDistort: (on: boolean) => void;
  /** Whether the exact values are shown. */
  numbers: boolean;
  onNumbers: (shown: boolean) => void;
  onReset: () => void;
  onCancel: () => void;
  onDone: () => void;
}) {
  return (
    <FloatingBar placement={props.placement} label="Transform actions">
      <button aria-label="Flip horizontal" title="Flip horizontal" onClick={() => props.onFlip('x')}>
        <SketchIcon name="mirror" size={20} />
      </button>
      <button aria-label="Flip vertical" title="Flip vertical" onClick={() => props.onFlip('y')}>
        <SketchIcon name="flipVertical" size={20} />
      </button>
      <button aria-label="Rotate 90°" title="Rotate 90° clockwise" onClick={() => props.onRotate()}>
        <SketchIcon name="rotate" size={20} />
      </button>
      <button
        aria-label="Distort"
        title="Distort: drag the corners on their own, in perspective"
        aria-pressed={props.distorted ? 'true' : 'false'}
        onClick={() => props.onDistort(!props.distorted)}
      >
        <SketchIcon name="distort" size={20} />
      </button>
      <button
        aria-label="Exact values"
        title="Exact values: size, angle and position"
        aria-pressed={props.numbers ? 'true' : 'false'}
        onClick={() => props.onNumbers(!props.numbers)}
      >
        <SketchIcon name="numbers" size={20} />
      </button>
      <FloatingBarSeparator />
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
      <FloatingBarSeparator />
      <button aria-label="Reset" title="Reset to the original placement" onClick={() => props.onReset()}>
        <SketchIcon name="reset" size={20} />
      </button>
      <button aria-label="Cancel" title="Cancel · Escape" onClick={() => props.onCancel()}>
        <SketchIcon name="close" size={20} />
      </button>
      <button class={floatingBarPrimary} aria-label="Done" title="Apply · Enter" onClick={() => props.onDone()}>
        <SketchIcon name="check" size={20} />
      </button>
    </FloatingBar>
  );
}
