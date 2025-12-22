import { createContextProvider } from '@utils/createContextProvider';
import { loadImageBitmap } from 'pixi.js';
import { createResource, JSX, Show } from 'solid-js';

const [Provider, useImageBitmap] = createContextProvider<ImageBitmap>();

export { useImageBitmap };

export function ImageBitmapProvider(props: { imgUrl: string; children: JSX.Element }) {
  const [bitmap] = createResource(() => loadImageBitmap(props.imgUrl));

  return <Show when={bitmap()}>{(source) => <Provider value={source()}>{props.children}</Provider>}</Show>;
}
