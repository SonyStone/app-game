import { Ripple } from '@app-game/ui-components/ripple';
import { useHref, useResolvedPath } from '@solidjs/router';

import { Show } from 'solid-js';

export function Thumbnail(props: { thumbnail?: string; href: string; name?: string }) {
  const resolvedPath = useResolvedPath(() => props.href);
  const href = useHref(resolvedPath);

  return (
    <a
      class="rounded-2 group relative flex aspect-square h-full w-full flex-col overflow-hidden rounded-3xl border border-gray-200 bg-slate-200 bg-white p-8 shadow-sm transition-shadow hover:shadow-md"
      href={href()}
    >
      <Ripple class="text-slate/20 z-2" />
      <Show when={!!props.name}>
        <div class="absolute inset-0 z-1 flex items-end bg-linear-to-t from-white/90 from-0% via-white/20 via-50% to-transparent to-100% transition-colors group-hover:via-white/30">
          <span class="bottom-0 flex-grow p-8 text-lg leading-relaxed font-medium text-gray-800">{props.name}</span>
        </div>
      </Show>
      <Show when={!!props.thumbnail}>
        <img class="rounded-1 absolute inset-0 object-cover" src={props.thumbnail} />
      </Show>
    </a>
  );
}
