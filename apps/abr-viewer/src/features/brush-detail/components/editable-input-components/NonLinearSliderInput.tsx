import { createMemo } from 'solid-js';

export type NonLinearSliderInputProps = {
  label: string;
  value: () => number;
  setValue: (v: number) => void;
  /** The breakpoint value where the slider behavior changes (default: 100) */
  breakpoint?: number;
  /** Minimum value (default: 1) */
  min?: number;
  /** Maximum value for the second range (default: 1000) */
  max?: number;
  step?: number;
  unit?: string;
};

/**
 * A non-linear slider that provides more precision in the lower range.
 * First half of slider: min to breakpoint (e.g., 1-100%)
 * Second half of slider: breakpoint to max (e.g., 100-1000%)
 *
 * This mimics Photoshop's spacing slider behavior.
 */
export function NonLinearSliderInput(props: NonLinearSliderInputProps) {
  const min = () => props.min ?? 1;
  const breakpoint = () => props.breakpoint ?? 100;
  const max = () => props.max ?? 1000;
  const step = () => props.step ?? 1;

  // Convert actual value to slider position (0-100)
  const valueToSlider = (value: number): number => {
    const bp = breakpoint();
    const minVal = min();
    const maxVal = max();

    if (value <= bp) {
      // First half: map [min, breakpoint] to [0, 50]
      return ((value - minVal) / (bp - minVal)) * 50;
    } else {
      // Second half: map [breakpoint, max] to [50, 100]
      return 50 + ((value - bp) / (maxVal - bp)) * 50;
    }
  };

  // Convert slider position (0-100) to actual value
  const sliderToValue = (sliderPos: number): number => {
    const bp = breakpoint();
    const minVal = min();
    const maxVal = max();

    if (sliderPos <= 50) {
      // First half: map [0, 50] to [min, breakpoint]
      return minVal + (sliderPos / 50) * (bp - minVal);
    } else {
      // Second half: map [50, 100] to [breakpoint, max]
      return bp + ((sliderPos - 50) / 50) * (maxVal - bp);
    }
  };

  const sliderValue = createMemo(() => valueToSlider(props.value()));

  const handleSliderChange = (sliderPos: number) => {
    const newValue = sliderToValue(sliderPos);
    // Round to step
    const rounded = Math.round(newValue / step()) * step();
    // Clamp to valid range
    const clamped = Math.max(min(), Math.min(max(), rounded));
    props.setValue(clamped);
  };

  const handleDirectInput = (value: number) => {
    const clamped = Math.max(min(), Math.min(max(), value));
    props.setValue(clamped);
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
            onInput={(e) => handleDirectInput(parseFloat(e.currentTarget.value) || min())}
            class="bg-ps-bg-dark border-ps-border text-ps-text w-16 rounded border px-0 py-1 text-right text-sm"
          />
          <span class="text-ps-text-muted ml-1 w-3 text-sm">{props.unit ?? '%'}</span>
        </div>
      </div>
      <div class="relative">
        <input
          type="range"
          aria-label={`${props.label} slider`}
          min={0}
          max={100}
          step={0.1}
          value={sliderValue()}
          onInput={(e) => handleSliderChange(parseFloat(e.currentTarget.value))}
          class="bg-ps-bg-lighter h-1.5 w-full cursor-pointer appearance-none rounded"
        />
        {/* Visual tick mark at the breakpoint (50% of slider) */}
        <div
          class="pointer-events-none absolute top-1/2 h-2 w-px -translate-y-1/2 bg-white/30"
          style={{ left: '50%' }}
        />
      </div>
    </div>
  );
}
