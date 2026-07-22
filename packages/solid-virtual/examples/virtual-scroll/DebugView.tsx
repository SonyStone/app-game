import { access, type MaybeAccessor } from '@solid-primitives/utils';

/** Displays the essential fixed-height virtualizer calculations. */
export function DebugView(props: {
  totalHeight: MaybeAccessor<number>;
  scrollPosition: MaybeAccessor<number>;
  visibleCount: MaybeAccessor<number>;
  startIndex: MaybeAccessor<number>;
  endIndex: MaybeAccessor<number>;
}) {
  return (
    <dl class="grid shrink-0 grid-cols-4 border-b border-zinc-200 bg-zinc-50">
      <Metric label="Range" value={`${access(props.startIndex)}–${access(props.endIndex)}`} />
      <Metric label="Rendered" value={access(props.visibleCount)} />
      <Metric label="Scroll" value={Math.round(access(props.scrollPosition))} />
      <Metric label="Height" value={Math.round(access(props.totalHeight))} />
    </dl>
  );
}

function Metric(props: { label: string; value: string | number }) {
  return (
    <div class="border-e border-zinc-200 px-3 py-2 last:border-e-0">
      <dt class="text-[9px] font-medium tracking-wider text-zinc-400 uppercase">{props.label}</dt>
      <dd class="mt-0.5 truncate font-mono text-[11px] text-zinc-700">{props.value}</dd>
    </div>
  );
}
