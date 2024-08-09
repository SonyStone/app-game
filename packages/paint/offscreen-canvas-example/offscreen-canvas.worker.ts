import { Renderer } from '@packages/ogl';
import { createTexture4colors } from '@packages/webgl-examples/ogl-model-viewer/texture-4-colors';
import { createEffect, createRoot, createSignal } from 'solid-js';
import { createSquareMesh } from '../brush-example/square/create-square-mesh';

createRoot(() => {
  const [offscreenCanvas, setOffscreenCanvas] = createSignal<OffscreenCanvas | undefined>(undefined);

  createEffect(() => {
    const canvas = offscreenCanvas();
    if (!canvas) {
      return;
    }

    const renderer = new Renderer({ dpr: 2, canvas, height: 500, width: 500 });
    const gl = renderer.gl;
    const mesh = createSquareMesh({ gl, texture: createTexture4colors(gl) });
    renderer.render({ scene: mesh });
  });

  onmessage = function (evt) {
    setOffscreenCanvas(evt.data.canvas);
  };
});
