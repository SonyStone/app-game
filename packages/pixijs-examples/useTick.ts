import { useApplication } from '@packages/solid-pixi';
import { TickerCallback } from 'pixi.js';
import { onCleanup } from 'solid-js';

export function useTick<T>(fn: TickerCallback<T>, context?: T, priority?: number) {
  const app = useApplication();

  // app.ticker

  app.ticker.add(fn, context, priority);

  onCleanup(() => {
    app.ticker.remove(fn);
  });
}
