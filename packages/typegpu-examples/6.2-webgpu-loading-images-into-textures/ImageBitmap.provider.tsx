import { createContextProvider } from '@app-game/solid-utils';
import type { JSX } from '@solidjs/web';
import { loadImageBitmap } from 'pixi.js';
import { createMemo, latest, Show, untrack } from 'solid-js';

const [Provider, useImageBitmap] = createContextProvider<ImageBitmap>();

export { useImageBitmap };

export function ImageBitmapProvider(props: { imgUrl: string; children: JSX.Element }) {
  const bitmap = createMemo(() => loadImageBitmap(props.imgUrl));

  return <Show when={latest(bitmap)}>{(source) => <Provider value={untrack(source)}>{props.children}</Provider>}</Show>;
}
