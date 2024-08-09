import { OGLRenderingContext, RenderTarget, Renderer, Transform } from '@packages/ogl';
import createRAF from '@solid-primitives/raf';
import { createEffect, createRoot, createSignal, untrack } from 'solid-js';
import { ColorBlendModes } from '../brush-example/blend-modes';
import { createBlendRenderTarget } from '../brush-example/blend/blend-render-target';
import { createBrushInstancing } from '../brush-example/brush-instancing/create-brush-instancing';
import { createBrushRenderTarget } from '../brush-example/brush/brush-render-target';
import { DEFAULTS_RENDER_TARGET_OPTIONS } from '../brush-example/defaults';
import { createSquareMesh } from '../brush-example/square/create-square-mesh';
import { createColorTexture } from '../brush-example/utils/black-texture';

createRoot(() => {
  const [resize, setResize] = createSignal({ width: 500, height: 500 });
  let renderer: Renderer;
  let gl: OGLRenderingContext;
  let scene: Transform;
  let brushInstancing: ReturnType<typeof createBrushInstancing>;

  const create = (canvas: OffscreenCanvas) => {
    renderer = new Renderer({ dpr: 1, canvas });
    gl = renderer.gl;
    scene = new Transform();

    const brush = createBrushRenderTarget({
      gl,
      color: [0, 0.8, 0]
    });
    brushInstancing = createBrushInstancing({
      gl,
      texture: () => brush().texture,
      // size: () => [resize().width, resize().height],
      color: [0, 0.4, 0]
    });

    const blendRenderTarget = new RenderTarget(gl, { ...DEFAULTS_RENDER_TARGET_OPTIONS, id: '🖼️ blend' });
    const blendLayers = createBlendRenderTarget({
      gl,
      target: blendRenderTarget,
      texture1: createColorTexture(gl, [255 / 2, 255 / 4, 0, 255]),
      texture2: () => brushInstancing.layer().texture,
      colorBlendMode: ColorBlendModes.USING_GAMMA
    });
    const mesh = createSquareMesh({
      gl,
      texture: blendRenderTarget.texture,
      transparent: true
    });
    mesh.setParent(scene);
  };

  createEffect(() => {
    const { width, height } = resize();
    renderer?.setSize(width, height);
  });

  let prevX: number | undefined;
  let prevY: number | undefined;
  const moveHandler = (event: { pressure: number; buttons: number; x: number; y: number }) => {
    if (event.pressure === 0 || event.buttons !== 1) {
      return;
    }
    let x = event.x;
    let y = event.y;
    const { width, height } = untrack(resize);

    if (prevX && prevY) {
      let dist = Math.sqrt(Math.pow(x - prevX, 2) + Math.pow(y - prevY, 2));
      let angle = Math.atan2(y - prevY, x - prevX);

      for (let i = 0; i < dist; i++) {
        let x = prevX + i * Math.cos(angle);
        let y = prevY + i * Math.sin(angle);

        x = (x / width) * 2 - 1;
        y = (y / height) * -2 + 1;

        brushInstancing.add({ point: [x, y], opacity: event.pressure });
      }
    } else {
      const _x = (x / width) * 2 - 1;
      const _y = (y / height) * -2 + 1;

      brushInstancing.add({ point: [_x, _y], opacity: event.pressure });
    }

    prevX = x;
    prevY = y;
  };

  const upHandler = (event: { pressure: number; buttons: number; x: number; y: number }) => {
    brushInstancing.apply();
    prevX = undefined;
    prevY = undefined;
  };

  const [, start, stop] = createRAF((t: number) => {
    if (!renderer) {
      return;
    }
    brushInstancing.render();
    renderer.render({ scene });
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
