import { For } from 'solid-js';

export type LoggedEvent = {
  readonly id: number;
  readonly source: 'script' | 'trusted';
  readonly target: string;
  readonly type: string;
  readonly x: number;
  readonly y: number;
};

export type MetricValue = {
  readonly label: string;
  readonly value: string;
};

export function MetricsPanel(props: {
  readonly class?: string;
  readonly events: readonly LoggedEvent[];
  readonly metrics: readonly MetricValue[];
}) {
  return (
    <aside
      class={`absolute left-4 z-40 w-[min(34rem,calc(100vw-2rem))] border border-zinc-300 bg-white/95 shadow-sm ${
        props.class ?? 'bottom-4'
      }`}
    >
      <div class="grid grid-cols-5 border-b border-zinc-200 text-sm">
        <For each={props.metrics}>{(metric) => <Metric label={metric.label} value={metric.value} />}</For>
      </div>

      <ol class="max-h-54 overflow-hidden p-2 text-xs">
        <For each={props.events}>
          {(event) => (
            <li class="grid grid-cols-[6.5rem_minmax(0,1fr)_4.5rem] gap-2 border-b border-zinc-100 px-1 py-1.5 last:border-b-0">
              <span class="font-mono text-zinc-900">{event.type}</span>
              <span class="truncate text-zinc-600">
                {event.target} / {event.source}
              </span>
              <span class="text-right font-mono text-zinc-500">
                {event.x},{event.y}
              </span>
            </li>
          )}
        </For>
      </ol>
    </aside>
  );
}

function Metric(props: { readonly label: string; readonly value: string }) {
  return (
    <div class="min-w-0 border-r border-zinc-200 px-3 py-2 last:border-r-0">
      <div class="truncate text-[0.68rem] text-zinc-500 uppercase">{props.label}</div>
      <div class="truncate font-mono text-sm text-zinc-950">{props.value}</div>
    </div>
  );
}
