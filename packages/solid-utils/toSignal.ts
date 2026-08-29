import { type Accessor, createSignal, onCleanup, type Setter, type Signal } from 'solid-js';

export function toSignal<T>(
  producer:
    | ((setter: Setter<T>) => () => void)
    | {
        subscribe: (fn: (v: T) => void) => (() => void) | { unsubscribe: () => void };
      },
  initialValue: T
): Accessor<T> {
  const [s, set] = createSignal(initialValue as Exclude<T, Function>, { equals: false }) as Signal<T>;
  if ('subscribe' in producer) {
    const unsub = producer.subscribe((v) => set(() => v));
    onCleanup(() => ('unsubscribe' in unsub ? unsub.unsubscribe() : unsub()));
  } else {
    const clean = producer(set);
    onCleanup(clean);
  }
  return s;
}
