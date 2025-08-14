import { Application, Stage } from '@packages/solid-pixi';
import { A } from '@solidjs/router';
import { For } from 'solid-js';
import { JSX } from 'solid-js/jsx-runtime';
import { routes } from './routes';

export default function App(props: { children?: JSX.Element }) {
  const canvas = (<canvas class="touch-none" />) as HTMLCanvasElement;

  return (
    <>
      <div class="absolute left-0 top-0 z-10 flex flex-col gap-2 bg-white p-2">
        <For each={routes}>
          {(route) => (
            <A href={'.' + route.path} class="text-blue-500 hover:underline">
              {route.name}
            </A>
          )}
        </For>
      </div>
      <Application resizeTo={window} canvas={canvas} background={'#1099bb'} useBackBuffer={true} antialias={true}>
        <Stage>{props.children}</Stage>
      </Application>
    </>
  );
}
