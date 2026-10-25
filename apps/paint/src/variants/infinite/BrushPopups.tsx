import type { BrushResource } from '@app-game/abr-paint/resources';
import type { Brush } from '@app-game/paint-core/brush';
import { Show } from 'solid-js';
import { maxBrushSize } from '../../features/brush';
import { geometricFraction, geometricValue } from '../procreate/sliderScale';
import { StrokePreview } from '../procreate/StrokePreview';
import styles from './BrushPopups.module.css';
import { InfiniteIcon } from './icons';
import { Slider } from './Slider';
import theme from './theme.module.css';

/**
 * Infinite Painter's Size pop-up, which a tap on the main toolbar's Size button opens: a live preview of the brush
 * with the brush editor's button at its top right, then the Size slider on a geometric scale from half a pixel to the
 * brush's largest size (`maxBrushSize`), shown as "4.7 px". The slider changes the brush while it is dragged; a
 * cancelled drag restores the size it started from.
 *
 * Infinite Painter's pop-up also has an Angle slider and a Blend mode choice; Paint's round brush has neither, so
 * they are left out.
 */
export function BrushSizePopup(props: {
  brush: Brush;
  /** Resolves the current preset's tip, texture and dual images for the real engine. */
  resources?: () => Promise<readonly BrushResource[]>;
  /** Receives each change of the size, as `{ size }`. */
  onChange: (patch: Partial<Brush>) => void;
  disabled?: boolean;
  /** Opens the brush editor; omitted, the preview's settings button is hidden. */
  onEdit?: () => void;
}) {
  const max = () => maxBrushSize(props.brush);
  const change = (size: number) => props.onChange({ size: Math.round(size * 10) / 10 });

  return (
    <div class={[theme.panel, styles.popup]} aria-label="Brush size">
      <LivePreview brush={props.brush} resources={props.resources} onEdit={props.onEdit} />
      <Slider
        label="Size"
        value={props.brush.size}
        min={minSize}
        max={max()}
        step={sizeStep(props.brush.size)}
        format={(size) => `${size < 10 ? size.toFixed(1) : Math.round(size)} px`}
        toFraction={(size) => geometricFraction(size, minSize, max())}
        fromFraction={(fraction) => geometricValue(fraction, minSize, max())}
        disabled={props.disabled}
        onInput={change}
        onChange={change}
      />
    </div>
  );
}

/**
 * Infinite Painter's Opacity pop-up, which a tap on the main toolbar's Opacity button opens: a live preview of the
 * brush, then Opacity (of the whole stroke), Flow (of each stamp along it) and Softness (Paint's hardness inverted,
 * `1 - hardness`), each from 0 to 100. Tapping a slider's name makes it the `target`, highlighted in red: the
 * parameter that a drag from the toolbar's Opacity button controls. The caller keeps and persists the target. The
 * sliders change the brush while dragged; a cancelled drag restores the value it started from.
 */
export function BrushOpacityPopup(props: {
  brush: Brush;
  /** Resolves the current preset's tip, texture and dual images for the real engine. */
  resources?: () => Promise<readonly BrushResource[]>;
  /** Receives each change, as `{ opacity }`, `{ flow }` or `{ hardness }`. */
  onChange: (patch: Partial<Brush>) => void;
  disabled?: boolean;
  /** The parameter the toolbar's Opacity button controls; its name shows in red. */
  target: OpacityTarget;
  /** Called with the parameter whose name was tapped. */
  onTarget: (target: OpacityTarget) => void;
  /** Opens the brush editor; omitted, the preview's settings button is hidden. */
  onEdit?: () => void;
}) {
  return (
    <div class={[theme.panel, styles.popup]} aria-label="Brush opacity">
      <LivePreview brush={props.brush} resources={props.resources} onEdit={props.onEdit} />
      <Slider
        label="Opacity"
        value={percent(props.brush.opacity)}
        min={1}
        max={100}
        step={1}
        highlighted={props.target === 'opacity'}
        onLabel={() => props.onTarget('opacity')}
        disabled={props.disabled}
        onInput={(value) => props.onChange({ opacity: fraction(value) })}
        onChange={(value) => props.onChange({ opacity: fraction(value) })}
      />
      <Slider
        label="Flow"
        value={percent(props.brush.flow)}
        min={1}
        max={100}
        step={1}
        highlighted={props.target === 'flow'}
        onLabel={() => props.onTarget('flow')}
        disabled={props.disabled}
        onInput={(value) => props.onChange({ flow: fraction(value) })}
        onChange={(value) => props.onChange({ flow: fraction(value) })}
      />
      <Slider
        label="Softness"
        value={percent(1 - props.brush.hardness)}
        min={0}
        max={100}
        step={1}
        highlighted={props.target === 'softness'}
        onLabel={() => props.onTarget('softness')}
        disabled={props.disabled}
        onInput={(value) => props.onChange({ hardness: 1 - fraction(value) })}
        onChange={(value) => props.onChange({ hardness: 1 - fraction(value) })}
      />
    </div>
  );
}

/** The brush parameter that the main toolbar's Opacity button drags: opacity, flow or softness (`1 - hardness`). */
export type OpacityTarget = 'opacity' | 'flow' | 'softness';

/** The live controls use the same engine preview as the brush libraries. */
function LivePreview(props: {
  brush: Brush;
  resources?: () => Promise<readonly BrushResource[]>;
  onEdit?: () => void;
}) {
  return (
    <div class={styles.preview}>
      <StrokePreview settings={props.brush} resources={props.resources} color="#d4d4d7" height={previewHeight} />
      <Show when={props.onEdit}>
        {(onEdit) => (
          <button
            class={[theme.iconButton, styles.edit]}
            aria-label="Edit brush"
            title="Edit brush"
            onClick={() => onEdit()()}
          >
            <InfiniteIcon name="brushSettings" size={18} />
          </button>
        )}
      </Show>
    </div>
  );
}

const previewHeight = 56;

/** The Size slider's smallest size, in pixels. */
const minSize = 0.5;

/** What a tap at a Size slider's end adds or takes away: finer for small brushes, as the scale is geometric. */
function sizeStep(size: number) {
  if (size < 10) {
    return 0.1;
  }

  return size < 100 ? 1 : 5;
}

/** A 0–1 brush value as a whole percentage. */
function percent(value: number) {
  return Math.round(value * 100);
}

/** A slider's percentage, rounded to whole percents, as a 0–1 brush value. */
function fraction(value: number) {
  return Math.round(value) / 100;
}
