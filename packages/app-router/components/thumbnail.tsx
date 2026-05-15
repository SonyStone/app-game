import { Ripple } from '@app-game/ui-components/ripple';
import { A } from '@solidjs/router';
import { Show } from 'solid-js';

export function Thumbnail(props: { thumbnail?: string; href: string; name?: string }) {
  return (
    <A
      class="rounded-2 group relative flex aspect-square h-full w-full flex-col overflow-hidden rounded-3xl border border-gray-200 bg-slate-200 bg-white p-8 shadow-sm transition-shadow hover:shadow-md"
      href={props.href}
    >
      <Ripple class="text-slate/20 z-2" />
      <Show when={!!props.name}>
        <div class="bg-linear-to-t absolute z-1 inset-0 flex items-end from-white/90 from-0% via-white/20 transition-colors group-hover:via-white/30 via-50% to-transparent to-100%">
          <span class=" bottom-0 flex-grow  p-8 text-lg font-medium leading-relaxed text-gray-800">{props.name}</span>
        </div>
      </Show>
      <Show when={!!props.thumbnail}>
        <img class="rounded-1 absolute inset-0 object-cover" src={props.thumbnail} />
      </Show>
    </A>
  );
}
