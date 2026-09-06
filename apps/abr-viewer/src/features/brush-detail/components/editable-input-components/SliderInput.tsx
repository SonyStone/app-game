export function SliderInput(props: {
  label: string;
  value: () => number;
  setValue: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}) {
  return (
    <div class="py-1.5">
      <div class="mb-1 flex items-center justify-between">
        <span class="text-ps-text-muted text-sm">{props.label}</span>
        <div class="flex items-center">
          <input
            type="number"
            aria-label={props.label}
            min={props.min ?? 0}
            max={props.max ?? 100}
            step={props.step ?? 1}
            value={props.value()}
            onInput={(e) => props.setValue(parseFloat(e.currentTarget.value) || 0)}
            class="bg-ps-bg-dark border-ps-border text-ps-text w-16 rounded border px-0 py-1 text-right text-sm"
          />
          <span class="text-ps-text-muted ml-1 w-3 text-sm">{props.unit ?? '%'}</span>
        </div>
      </div>
      <input
        type="range"
        aria-label={`${props.label} slider`}
        min={props.min ?? 0}
        max={props.max ?? 100}
        step={props.step ?? 1}
        value={props.value()}
        onInput={(e) => props.setValue(parseFloat(e.currentTarget.value))}
        class="bg-ps-bg-lighter h-1.5 w-full cursor-pointer appearance-none rounded"
      />
    </div>
  );
}
