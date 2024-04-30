import { createSignal, For } from 'solid-js';

import s from './Ripple.module.css';
import { RippleItem } from './RippleItem';

type ExtPointerEvent = PointerEvent & { currentTarget: HTMLDivElement; target: Element };

export function Ripple(props: { class?: string }) {
  const [list, setList] = createSignal<ExtPointerEvent[]>([]);

  return (
    <div
      class={s.ripple + ' ' + props.class}
      onPointerDown={function (event) {
        setList(add(event, list()));
      }}
    >
      <For each={list()}>
        {(event) => (
          <RippleItem
            event={event}
            onFadeOut={function (event) {
              setList(remove(event, list()));
            }}
          ></RippleItem>
        )}
      </For>
    </div>
  );
}

function add<T>(item: T, array: T[]) {
  return [...array, item];
}

function remove<T>(item: T, array: T[]) {
  array.splice(array.indexOf(item), 1);
  return [...array];
}
