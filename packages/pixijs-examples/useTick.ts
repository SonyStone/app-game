import { useApplication } from '@packages/solid-pixi';
import { Ticker, TickerCallback } from 'pixi.js';
import { createMemo, createSignal, onCleanup, untrack } from 'solid-js';

export function useTick<T>(fn: TickerCallback<T>, context?: T, priority?: number) {
  const app = useApplication();

  app.ticker.add(fn, context, priority);

  onCleanup(() => {
    app.ticker.remove(fn);
  });
}

export function useTick2<T>(context?: T, priority?: number) {
  const app = useApplication();
  const [tick, setTick] = createSignal<Ticker>(app.ticker, { equals: false });
  app.ticker.add(setTick, context, priority);

  onCleanup(() => {
    app.ticker.remove(setTick);
  });

  return tick;
}

export function createElapsedMS() {
  const ticker = useTick2();
  return createMemo((v: number) => {
    return v + ticker().elapsedMS;
  }, untrack(ticker).elapsedMS);
}

export function createDeltaMS() {
  const ticker = useTick2();

  return createMemo((v: number) => {
    return v + ticker().deltaMS;
  }, untrack(ticker).deltaMS);
}
