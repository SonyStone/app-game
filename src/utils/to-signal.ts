import { Accessor, createSignal, onCleanup, Setter } from 'solid-js';

export function toSignal<T>(
  producer:
    | ((setter: Setter<T>) => () => void)
    | {
        subscribe: (
          fn: (v: T) => void
        ) => (() => void) | { unsubscribe: () => void };
      },
  initialValue: T
): Accessor<T> {
  const [s, set] = createSignal<T>(initialValue, { equals: false });
  if ('subscribe' in producer) {
    const unsub = producer.subscribe((v) => set(() => v));
    onCleanup(() => ('unsubscribe' in unsub ? unsub.unsubscribe() : unsub()));
  } else {
    const clean = producer(set);
    onCleanup(clean);
  }
  return s;
}
