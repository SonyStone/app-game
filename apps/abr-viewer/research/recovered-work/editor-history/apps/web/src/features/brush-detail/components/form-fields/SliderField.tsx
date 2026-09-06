type SliderFieldProps = {
  value: number | undefined;
  name: string;
  inputRef: (el: HTMLInputElement) => void;
  onInput: (e: Event) => void;
  onChange: (e: Event) => void;
  onBlur: (e: Event) => void;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
};

export function SliderField(props: SliderFieldProps) {
  return (
    <div class="flex items-center gap-3 py-2">
      <span class="text-ps-text-muted w-32 flex-shrink-0 text-sm">{props.label}</span>
      <input
        type="range"
        min={props.min ?? 0}
        max={props.max ?? 100}
        step={props.step ?? 1}
        value={props.value ?? 0}
        ref={props.inputRef}
        onInput={props.onInput}
        onChange={props.onChange}
        onBlur={props.onBlur}
        name={props.name}
        class="bg-ps-bg-lighter h-1 flex-1 cursor-pointer appearance-none rounded"
      />
      <div class="flex w-20 items-center">
        <input
          type="number"
          min={props.min ?? 0}
          max={props.max ?? 100}
          step={props.step ?? 1}
          value={props.value ?? 0}
          onInput={props.onInput}
          onChange={props.onChange}
          onBlur={props.onBlur}
          class="bg-ps-bg-dark border-ps-border text-ps-text w-16 rounded border px-2 py-1 text-right text-sm"
        />
        <span class="text-ps-text-muted ml-1 text-sm">{props.unit ?? '%'}</span>
      </div>
    </div>
  );
}
