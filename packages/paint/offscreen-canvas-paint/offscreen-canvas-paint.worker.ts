import { Renderer } from '@packages/ogl';
import createRAF from '@solid-primitives/raf';
import { createEffect, createRoot, createSignal } from 'solid-js';
import { createSquareMesh } from '../brush-example/square/create-square-mesh';
import { createBrushStroke } from '../canvas-paint/brush-stroke';

createRoot((dispose) => {
  const [resize, setResize] = createSignal({ width: 500, height: 500 });
  let renderer: Renderer;
  let brushStroke: ReturnType<typeof createBrushStroke>;

  createEffect(() => {
    const { width, height } = resize();
    renderer?.setSize(width, height);
  });

  const create = (canvas: OffscreenCanvas) => {
    createRoot((dispose) => {
      renderer = new Renderer({ dpr: 1, canvas, alpha: false, premultipliedAlpha: false });
      const gl = renderer.gl;

      console.clear();

      brushStroke = createBrushStroke({
        gl,
        brushColor: [255, 255, 255],
        size: () => [resize().width, resize().height],
        renderer
      });

      const mesh = createSquareMesh({
        gl,
        texture: brushStroke.layer,
        zIndex: 0.9
      });
      mesh.setParent(brushStroke.scene);
    });
  };

  const moveHandler = (event: { pressure: number; buttons: number; x: number; y: number }) => {
    if (event.pressure === 0 || event.buttons !== 1) {
      return;
    }
    let x = event.x;
    let y = event.y;

    brushStroke?.add([x, y], event.pressure);
  };

  const upHandler = (event: { pressure: number; buttons: number; x: number; y: number }) => {
    brushStroke?.end();
  };

  const [, start, stop] = createRAF((t: number) => {
    brushStroke?.render();
  });
  start();

  onmessage = function (evt) {
    const type = evt.data.type;
    switch (type) {
      case 'canvas': {
        create(evt.data.canvas);
        return;
      }
      case 'resize': {
        setResize(evt.data.resize);
        return;
      }
      case 'pointermove': {
        moveHandler(evt.data.event);
        return;
      }
      case 'pointerup': {
        upHandler(evt.data.event);
        return;
      }
    }
  };
});
