import { Vec2Tuple } from '@packages/math';
import { Mesh, OGLRenderingContext, Program, Texture } from '@packages/ogl';
import { Attribute } from '@packages/ogl/core/geometry';
import { RenderTarget, RenderTargetOptions } from '@packages/ogl/core/render-target';
import { Square } from '@packages/ogl/extras/square';
import { Vec3Tuple } from '@packages/ogl/math/vec-3';
import { MaybeAccessor, access } from '@solid-primitives/utils';
import { createSignal } from 'solid-js';
import { DEFAULTS_RENDER_TARGET_OPTIONS } from '../defaults';
import { resizeBuffer } from '../utils/resize-buffer';
import fragment from './brush-instancing.frag?raw';
import vertex from './brush-instancing.vert?raw';

/**
 * creates new render target (texture) - draw instancing of brushes on it
 *
 * color should be the same as the brush color
 *
 * @params
 * * texture: Texture
 * * color: rgb
 * * instancedCount: number
 * * position:
 * * opacity
 *
 * @returns
 */
export const createBrushInstancing = ({
  gl,
  texture,
  color,
  target = new RenderTarget(gl, DEFAULTS_RENDER_TARGET_OPTIONS),
  swap,
  beforeRender,
  afterRender
}: {
  gl: OGLRenderingContext;
  target?: MaybeAccessor<RenderTarget>;
  texture?: MaybeAccessor<Texture | undefined>;
  color?: MaybeAccessor<[number, number, number] | undefined>;
  options?: Partial<RenderTargetOptions>;
  swap?: () => void;
  beforeRender?: () => void;
  afterRender?: () => void;
}) => {
  const [layer, setLayer] = createSignal(access(target), { equals: () => false });

  let needsUpdate = true;

  const mesh = new BrushStrokeMesh(gl);

  let i = 0;
  const add = (options: { point: Vec2Tuple; opacity: number }) => {
    // console.log(`add`, i);
    if (i > 1000) {
      i = 0;
      swap?.();
    }

    mesh.setBrushSpot(i, options.point, options.opacity);

    mesh.setInstancedCount(i + 1);
    setInstancedCount(i + 1);
    i++;
    needsUpdate = true;
  };

  const [instancedCount, setInstancedCount] = createSignal(0);
  // update the instanced count and attributes
  const apply = () => {
    i = 0;
    swap?.();
    needsUpdate = true;
  };

  const render = () => {
    if (!needsUpdate) {
      return;
    }

    // update uniforms
    {
      mesh.setBrushTexture(access(texture));
      mesh.setBrushColor(access(color));
    }

    beforeRender?.();
    gl.clearColor(mesh.uColor.value[0], mesh.uColor.value[1], mesh.uColor.value[2], 0);
    gl.renderer.render({
      scene: mesh,
      target: access(target),
      clear: true
    });
    console.log('2️⃣ rendering brush stroke', access(target).id);
    setLayer(access(target));
    needsUpdate = false;
    afterRender?.();
  };

  const clear = () => {
    gl.clearColor(mesh.uColor.value[0], mesh.uColor.value[1], mesh.uColor.value[2], 0);
  };

  return { layer, render, clear, add, apply, instancedCount };
};

export class BrushStrokeMesh extends Mesh {
  static POINT_BUFFER_OFFSET = 2;
  static BUFFER_COUNT = 32;

  private readonly offset: Pick<Attribute, 'instanced' | 'size' | 'data' | 'usage' | 'needsUpdate'>;
  private readonly opacity: Pick<Attribute, 'instanced' | 'size' | 'data' | 'usage' | 'needsUpdate'>;
  private readonly tBrush: { value: Texture | undefined };
  readonly uColor: { value: Vec3Tuple };

  constructor(gl: OGLRenderingContext) {
    const offset = {
      instanced: 1,
      size: 2,
      data: new Float32Array(BrushStrokeMesh.BUFFER_COUNT * BrushStrokeMesh.POINT_BUFFER_OFFSET),
      usage: gl.DYNAMIC_DRAW,
      needsUpdate: true
    };
    const opacity = {
      instanced: 1,
      size: 1,
      data: new Float32Array(BrushStrokeMesh.BUFFER_COUNT),
      usage: gl.DYNAMIC_DRAW,
      needsUpdate: true
    };

    const tBrush = { value: undefined };
    const uColor = { value: [0, 0, 0] as Vec3Tuple };

    super(gl, {
      geometry: new Square(gl, {
        attributes: {
          offset,
          opacity
        }
      }),
      program: new Program(gl, {
        vertex,
        fragment,
        uniforms: { tBrush, uColor },
        transparent: true,
        blendFunc: {
          src: gl.SRC_ALPHA,
          dst: gl.ONE_MINUS_SRC_ALPHA,
          srcAlpha: gl.ONE,
          dstAlpha: gl.ONE_MINUS_SRC_ALPHA
        }
      })
    });
    this.offset = offset;
    this.opacity = opacity;
    this.tBrush = tBrush;
    this.uColor = uColor;
  }

  render(target?: RenderTarget) {
    this.gl.renderer.clearColor({ target, color: this.uColor.value });
    this.gl.renderer.render({
      scene: this,
      target,
      clear: true
    });
  }

  clear(target?: RenderTarget) {
    this.gl.renderer.clearColor({ target, color: this.uColor.value });
  }

  setInstancedCount(value: number) {
    this.geometry.instancedCount = value;
  }

  setBrushSpot(index: number = 0, point: Vec2Tuple, opacity: number = 1) {
    const pointOffset = index * BrushStrokeMesh.POINT_BUFFER_OFFSET;
    resizeBuffer(this.offset, pointOffset);
    this.offset.data.set(point, pointOffset);
    this.offset.needsUpdate = true;

    resizeBuffer(this.opacity, index);
    this.opacity.data.set([opacity], index);
    this.opacity.needsUpdate = true;
  }

  setBrushTexture(texture: Texture | undefined) {
    this.tBrush.value = texture;
  }

  setBrushColor(color: Vec3Tuple = [0, 0, 0]) {
    this.uColor.value = color;
  }
}
