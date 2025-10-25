import { createMutationObserver } from '@solid-primitives/mutation-observer';
import { access, MaybeAccessor } from '@solid-primitives/utils';
import { createEffect, createSignal } from 'solid-js';

export function createMutationObserverRecords(element: MaybeAccessor<Element | undefined>) {
  const [records, setRecords] = createSignal<MutationRecord[]>([]);
  createEffect(() => {
    const parentElement = access(element);
    if (!parentElement) return;
    createMutationObserver(parentElement, { childList: true }, setRecords);
  });
  return records;
}
