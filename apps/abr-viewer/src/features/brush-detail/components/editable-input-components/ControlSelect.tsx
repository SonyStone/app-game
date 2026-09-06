import { For } from 'solid-js';

const CONTROL_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 2, label: 'Pen Pressure' },
  { value: 3, label: 'Pen Tilt' },
  { value: 4, label: 'Stylus Wheel' },
  { value: 5, label: 'Rotation' },
  { value: 1, label: 'Fade' }
];

export function ControlSelect(props: { label: string; value: () => number; setValue: (v: number) => void }) {
  return (
    <div class="ml-8 flex items-center gap-3 py-1">
      <span class="text-ps-text-muted w-24 text-sm">{props.label}</span>
      <select
        value={props.value()}
        onChange={(e) => props.setValue(parseInt(e.currentTarget.value))}
        class="bg-ps-bg-dark border-ps-border text-ps-text flex-1 rounded border px-2 py-1 text-sm"
      >
        <For each={CONTROL_OPTIONS}>{(opt) => <option value={opt.value}>{opt.label}</option>}</For>
      </select>
    </div>
  );
}
