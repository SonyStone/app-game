import { createContextProvider } from '@app-game/solid-utils';
import type { JSX } from '@solidjs/web';
import { AutoDetectOptions, autoDetectRenderer, Renderer as PixiRenderer } from 'pixi.js';
import { createMemo, latest, omit, onCleanup, Show } from 'solid-js';

const [Provider, useRenderer] = createContextProvider<PixiRenderer>();
export { useRenderer };

export function RendererProvider(props: Partial<AutoDetectOptions> & Partial<{ children: JSX.Element }>) {
  const options = omit(props, 'children');

  const renderer = createMemo(() => autoDetectRenderer(options));

  onCleanup(() => {
    latest(renderer)?.destroy();
  });

  <Show when={latest(renderer)}>{(renderer) => <Provider value={renderer()}>{props.children}</Provider>}</Show>;

  return <></>;
}
