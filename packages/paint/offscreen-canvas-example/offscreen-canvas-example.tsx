import { Renderer } from '@packages/ogl';

import { createTexture4colors } from '@packages/webgl-examples/ogl-model-viewer/texture-4-colors';
import { createSquareMesh } from '../brush-example/square/square.component';

import { For, onCleanup, onMount } from 'solid-js';
import OffscreenCanvasWorker from './offscreen-canvas.worker?worker';

export default function OffscreenCanvasExample() {
  const canvases = [
    {
      description: 'webgl2',
      canvas: (() => {
        const canvas = (<canvas class="h-50px w-50px touch-none" height={50} width={50} />) as HTMLCanvasElement;
        const renderer = new Renderer({ dpr: 2, canvas, height: 50, width: 50 });
        const gl = renderer.gl;
        const mesh = createSquareMesh({ gl, texture: createTexture4colors(gl) });
        renderer.render({ scene: mesh });
        return canvas;
      })()
    },
    {
      description: 'webgl2 transferControlToOffscreen',
      canvas: (() => {
        const canvasEl = (<canvas class="h-50px w-50px touch-none" height={50} width={50} />) as HTMLCanvasElement;
        // should be mounted before use
        onMount(() => {
          // takes some time to render
          const canvas = canvasEl.transferControlToOffscreen();
          const renderer = new Renderer({ dpr: 2, canvas, height: 50, width: 50 });
          const gl = renderer.gl;
          const mesh = createSquareMesh({ gl, texture: createTexture4colors(gl) });
          renderer.render({ scene: mesh });
        });
        return canvasEl;
      })()
    },
    {
      description: 'webgl2 transferControlToOffscreen to webworker',
      canvas: (() => {
        const worker = new OffscreenCanvasWorker();
        const canvasEl = (<canvas class="h-50px w-50px touch-none" height={50} width={50} />) as HTMLCanvasElement;

        onMount(() => {
          // should be mounted before use
          const canvas = canvasEl.transferControlToOffscreen();
          // takes way more time to render
          worker.postMessage({ canvas }, [canvas]);
        });

        onCleanup(() => {
          worker.terminate();
        });

        return canvasEl;
      })()
    }
  ];

  return (
    <div class="flex p-4">
      <table class="border-separate border-spacing-2">
        <thead>
          <tr>
            <th class="text-start">Feature</th>
            <th>Support</th>
          </tr>
        </thead>
        <tbody>
          <For each={canvases}>
            {({ canvas, description }) => (
              <tr>
                <th class="text-start">{description}</th>
                <td>{canvas}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}
