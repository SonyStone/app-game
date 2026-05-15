import type { JSX } from 'solid-js';

export function StateCard(props: { label: string; value: string; active?: boolean; testId?: string }): JSX.Element {
  return (
    <div
      data-testid={props.testId}
      class={`rounded-lg border p-3 ${
        props.active ? 'border-blue-500/40 bg-blue-500/10' : 'border-white/10 bg-white/5'
      }`}
    >
      <div class="mb-1 text-xs text-neutral-500">{props.label}</div>
      <div class={`font-mono text-sm ${props.active ? 'text-blue-300' : 'text-neutral-300'}`}>{props.value}</div>
    </div>
  );
}
