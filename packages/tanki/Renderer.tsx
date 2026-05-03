import { createContextProvider } from '@app-game/solid-utils';
import { AutoDetectOptions, autoDetectRenderer, Renderer as PixiRenderer } from 'pixi.js';
import { createResource, JSX, onCleanup, Show, splitProps } from 'solid-js';

const [Provider, useRenderer] = createContextProvider<PixiRenderer>();
export { useRenderer };

export function RendererProvider(props: Partial<AutoDetectOptions> & Partial<{ children: JSX.Element }>) {
  const [common, options] = splitProps(props, ['children']);

  const [renderer] = createResource(
    () => autoDetectRenderer,
    async (fn) => {
      return await fn(options);
    }
  );

  onCleanup(() => {
    renderer()?.destroy();
  });

  <Show when={renderer()}>{(renderer) => <Provider value={renderer()}>{common.children}</Provider>}</Show>;

  return <></>;
}
