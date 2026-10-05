import { curvePosition, curveValue, type SliderCurve } from '@app-game/abr-brush/sliderCurves';
import { createMemo } from 'solid-js';

export type NonLinearSliderInputProps = {
  label: string;
  value: () => number;
  setValue: (v: number) => void;
  /**
   * Slider positions from 0 to 1 and their values; its first and last values are the range. Photoshop's Size and
   * Spacing curves are in `@app-game/abr-brush/sliderCurves`.
   */
  curve: SliderCurve;
  step?: number;
  unit?: string;
};

/**
 * A slider that moves along straight segments between the breakpoints of `curve`, as Photoshop's brush Size and
 * Spacing sliders do, so small values get most of the track; the number beside it takes exact values. Values from
 * the slider are rounded to `step`.
 */
export function NonLinearSliderInput(props: NonLinearSliderInputProps) {
  const min = () => props.curve[0]![1];
  const max = () => props.curve.at(-1)![1];
  const step = () => props.step ?? 1;
  const clamp = (value: number) => Math.max(min(), Math.min(max(), value));
  const sliderValue = createMemo(() => curvePosition(props.curve, props.value()) * positions);

  const handleSliderChange = (position: number) => {
    const value = curveValue(props.curve, position / positions);
    props.setValue(clamp(Math.round(value / step()) * step()));
  };

  return (
    <div class="py-1.5">
      <div class="mb-1 flex items-center justify-between">
        <span class="text-ps-text-muted text-sm">{props.label}</span>
        <div class="flex items-center">
          <input
            type="number"
            aria-label={props.label}
            min={min()}
            max={max()}
            step={step()}
            value={Math.round(props.value())}
            onInput={(e) => props.setValue(clamp(parseFloat(e.currentTarget.value) || min()))}
            class="bg-ps-bg-dark border-ps-border text-ps-text w-16 rounded border px-0 py-1 text-right text-sm"
          />
          <span class="text-ps-text-muted ml-1 w-3 text-sm">{props.unit ?? '%'}</span>
        </div>
      </div>
      <input
        type="range"
        aria-label={`${props.label} slider`}
        min={0}
        max={positions}
        step={1}
        value={sliderValue()}
        onInput={(e) => handleSliderChange(e.currentTarget.valueAsNumber)}
        class="bg-ps-bg-lighter h-1.5 w-full cursor-pointer appearance-none rounded"
      />
    </div>
  );
}

/** Slider positions along the track: fine enough that every small value has its own. */
const positions = 1000;
