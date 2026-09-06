import { For } from 'solid-js';

const CONTROL_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 2, label: 'Pen Pressure' },
  { value: 3, label: 'Pen Tilt' },
  { value: 4, label: 'Stylus Wheel' },
  { value: 5, label: 'Rotation' },
  { value: 1, label: 'Fade' }
];

type ControlSelectFieldProps = {
  value: number | undefined;
  name: string;
  inputRef: (el: HTMLSelectElement) => void;
  onInput: (e: Event) => void;
  onChange: (e: Event) => void;
  onBlur: (e: Event) => void;
  label: string;
};

export function ControlSelectField(props: ControlSelectFieldProps) {
  return (
    <div class="ml-8 flex items-center gap-3 py-1">
      <span class="text-ps-text-muted w-24 text-sm">{props.label}</span>
      <select
        value={props.value ?? 0}
        ref={props.inputRef}
        onInput={props.onInput}
        onChange={props.onChange}
        onBlur={props.onBlur}
        name={props.name}
        class="bg-ps-bg-dark border-ps-border text-ps-text flex-1 rounded border px-2 py-1 text-sm"
      >
        <For each={CONTROL_OPTIONS}>{(opt) => <option value={opt.value}>{opt.label}</option>}</For>
      </select>
    </div>
  );
}
