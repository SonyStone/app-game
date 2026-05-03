import { Vec2 } from '@app-game/math/v2';
import { angleTo, distance, isEqual } from '@app-game/math/v2-functions';
import { OGLRenderingContext, RenderTarget, Renderer, Transform } from '@app-game/ogl';
import { SwapBuffering } from '@app-game/ogl/extras/swap-buffering';
import { createTexture4colors } from '@packages/webgl-examples/ogl-model-viewer/texture-4-colors';
import { MaybeAccessor, access } from '@solid-primitives/utils';
import { createEffect, createSignal } from 'solid-js';
import { BlendMesh } from '../brush-example/blend/blend-mesh';
import { BrushStrokeMesh } from '../brush-example/brush-instancing/brush-stroke-mesh';
import { BrushMesh } from '../brush-example/brush/brush-mesh';
import { DEFAULTS_RENDER_TARGET_OPTIONS } from '../brush-example/defaults';
import { rgbToNormalized } from '../brush-example/utils/color-functions';
import { TextureMesh } from '../brush-example/utils/texture-to-render-target/texture-mesh';
import { pointToCanvasPoint } from './utils-point-position';

/**
 *
 * creates brush stroke
 * mixes brush stroke with background
 */
export const createBrushStroke = ({
  gl,
  brushColor,
  renderer,
  size
}: {
  gl: OGLRenderingContext;
  brushColor: MaybeAccessor<[number, number, number]>;
  size: MaybeAccessor<[number, number]>;
  renderer: Renderer;
}) => {
  const scene = new Transform();

  // creates swap buffer to merge brush stroke with brush strokes
  const swapBuffers = new SwapBuffering(gl, DEFAULTS_RENDER_TARGET_OPTIONS);
  const background = createBackground({ gl, swapBuffers });
  background.render();

  // creates and renderer brush texture
  // ! brush spot texture
  const brushTexture = new RenderTarget(gl, { ...DEFAULTS_RENDER_TARGET_OPTIONS, id: '🖼️brush' });
  createSpotMesh({ gl, brushTexture, brushColor });

  const brushStrokeTexture = new RenderTarget(gl, { ...DEFAULTS_RENDER_TARGET_OPTIONS, id: '🖼️brush-stroke' });
  const brushStrokeMesh = new BrushStrokeMesh(gl);
  createEffect(() => {
    brushStrokeMesh.setBrushTexture(brushTexture.texture);
    brushStrokeMesh.setBrushColor(rgbToNormalized(access(brushColor)));
  });
  const blendMesh = new BlendMesh(gl);

  const [targetTexture, setTargetTexture] = createSignal(swapBuffers.write.texture, { equals: () => false });

  let instance = 0;
  let needsUpdate = false;

  let prev: Vec2 | undefined;
  let prevOpacity: number | undefined;

  const end = () => {
    instance = 0;
    prev = undefined;
  };

  const setPoint = (point: Vec2, opacity: number) => {
    brushStrokeMesh.setBrushSpot(instance, point, opacity, opacity);
    instance++;
    brushStrokeMesh.setInstancedCount(instance);
  };

  return {
    render: (force?: boolean) => {
      if (force) {
        needsUpdate = true;
      }
      if (!needsUpdate) {
        return;
      }
      needsUpdate = false;
      brushStrokeMesh.render(brushStrokeTexture); // render brush stroke
      blendMesh.setTexture1(swapBuffers.read.texture);
      blendMesh.setTexture2(brushStrokeTexture.texture);
      blendMesh.render(swapBuffers.write); // blend swap read with brush stroke into swap write
      swapBuffers.swap(); // swap read with write
      instance = 0;
      setTargetTexture(swapBuffers.read.texture); // set scene target texture to swap read
      renderer.render({ scene }); // render scene
    },
    clear: () => {
      background.clear();
    },
    add: (point: Vec2, opacity: number) => {
      const [width, height] = access(size);
      if (prev && prevOpacity !== undefined) {
        if (isEqual(point, prev)) {
          return;
        }
        const dist = distance(point, prev);
        const angle = angleTo(point, prev);

        for (let i = 0; i < dist; i++) {
          let point = Vec2.create(prev[0] + i * Math.cos(angle), prev[1] + i * Math.sin(angle));
          const tempOpacity = prevOpacity + (opacity - prevOpacity) * (i / dist);
          point = pointToCanvasPoint(point, width, height);
          setPoint(point, tempOpacity);
        }
      } else {
        setPoint(pointToCanvasPoint(point, width, height), opacity);
      }

      prev = point;
      prevOpacity = opacity;
      needsUpdate = true;
    },
    end: end,
    layer: targetTexture,
    brushTexture: brushTexture,
    brushStrokeTexture: brushStrokeTexture,
    swapBuffers: swapBuffers,
    scene: scene
  };
};

const createSpotMesh = ({
  gl,
  brushTexture,
  brushColor
}: {
  gl: OGLRenderingContext;
  brushTexture: RenderTarget;
  brushColor: MaybeAccessor<[number, number, number]>;
}) => {
  const spotMesh = new BrushMesh(gl);
  createEffect(() => {
    spotMesh.setColor(rgbToNormalized(access(brushColor)));
    spotMesh.render(brushTexture);
  });
};

const createBackground = ({ gl, swapBuffers }: { gl: OGLRenderingContext; swapBuffers: SwapBuffering }) => {
  const backgroundTextTexture = createTexture4colors(
    gl,
    [255 * 0.1, 255 * 0.1, 255 * 0.1, 255],
    [0, 255 * 0.4, 0, 255],
    [255 * 0.8, 0, 0, 255],
    [0, 0, 255 * 0.4, 255]
  );
  const mesh = new TextureMesh(gl, { texture: backgroundTextTexture });
  const render = () => {
    mesh.render(swapBuffers.read);
  };
  const clear = () => {
    mesh.render(swapBuffers.read);
    mesh.render(swapBuffers.write);
  };

  return { mesh, render, clear };
};
