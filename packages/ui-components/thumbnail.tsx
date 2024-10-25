import { A } from '@solidjs/router';
import { Show } from 'solid-js';
import { Ripple } from './ripple/Ripple';

export function Thumbnail(props: { thumbnail?: string; href: string; name?: string }) {
  return (
    <A class="rounded-2 relative flex aspect-square w-full bg-slate-200 p-2" href={props.href}>
      <Show when={!!props.thumbnail}>
        <img class="rounded-1 object-cover" src={props.thumbnail} />
      </Show>
      <Show when={!!props.name}>
        <span class="rounded-2 absolute bottom-0 start-0 max-w-full bg-slate-200 px-2 pb-2 text-2xl leading-6">
          {props.name}
        </span>
      </Show>
      <Ripple class="text-slate/20" />
    </A>
  );
}
