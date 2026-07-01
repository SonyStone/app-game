import { Application, Stage } from '@app-game/solid-pixi';
import type { JSX } from 'solid-js';

type AppProps = {
  children?: JSX.Element;
};

export default function App(props: AppProps) {
  const canvas = (<canvas class="block h-full w-full touch-none" />) as HTMLCanvasElement;

  return (
    <Application resizeTo={window} canvas={canvas} background="#060807" antialias resolution={window.devicePixelRatio}>
      <Stage>{props.children}</Stage>
    </Application>
  );
}
