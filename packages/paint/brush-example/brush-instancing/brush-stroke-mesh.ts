import { Vec2Tuple } from '@packages/math';
import { Mesh, OGLRenderingContext, Program, Texture } from '@packages/ogl';
import { Attribute } from '@packages/ogl/core/geometry';
import { RenderTarget } from '@packages/ogl/core/render-target';
import { Square } from '@packages/ogl/extras/square';
import { Vec3Tuple } from '@packages/ogl/math/vec-3';
import { resizeBuffer } from '../utils/resize-buffer';
import fragment from './brush-instancing.frag?raw';
import vertex from './brush-instancing.vert?raw';

export class BrushStrokeMesh extends Mesh {
  static POINT_BUFFER_OFFSET = 2;
  static BUFFER_COUNT = 32;

  private readonly attributes: {
    offset: Pick<Attribute, 'instanced' | 'size' | 'data' | 'usage' | 'needsUpdate'>;
    opacity: Pick<Attribute, 'instanced' | 'size' | 'data' | 'usage' | 'needsUpdate'>;
    size: Pick<Attribute, 'instanced' | 'size' | 'data' | 'usage' | 'needsUpdate'>;
  };
  private readonly tBrush: { value: Texture | undefined };
  readonly uColor: { value: Vec3Tuple };

  constructor(gl: OGLRenderingContext) {
    const attributes = {
      offset: {
        instanced: 1,
        size: 2,
        data: new Float32Array(BrushStrokeMesh.BUFFER_COUNT * BrushStrokeMesh.POINT_BUFFER_OFFSET),
        usage: gl.DYNAMIC_DRAW,
        needsUpdate: true
      },
      opacity: {
        instanced: 1,
        size: 1,
        data: new Float32Array(BrushStrokeMesh.BUFFER_COUNT),
        usage: gl.DYNAMIC_DRAW,
        needsUpdate: true
      },
      size: {
        instanced: 1,
        size: 1,
        data: new Float32Array(BrushStrokeMesh.BUFFER_COUNT),
        usage: gl.DYNAMIC_DRAW,
        needsUpdate: true
      }
    };

    const tBrush = { value: undefined };
    const uColor = { value: [0, 0, 0] as Vec3Tuple };

    super(gl, {
      geometry: new Square(gl, {
        attributes
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
    this.attributes = attributes;
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

  setBrushSpot(index: number = 0, point: Vec2Tuple, opacity: number = 1, size: number = 1) {
    const pointOffset = index * BrushStrokeMesh.POINT_BUFFER_OFFSET;
    resizeBuffer(this.attributes.offset, pointOffset);
    this.attributes.offset.data.set(point, pointOffset);
    this.attributes.offset.needsUpdate = true;

    resizeBuffer(this.attributes.opacity, index);
    this.attributes.opacity.data.set([opacity], index);
    this.attributes.opacity.needsUpdate = true;

    resizeBuffer(this.attributes.size, index);
    this.attributes.size.data.set([size], index);
    this.attributes.size.needsUpdate = true;
  }

  setBrushTexture(texture: Texture | undefined) {
    this.tBrush.value = texture;
  }

  setBrushColor(color: Vec3Tuple = [0, 0, 0]) {
    this.uColor.value = color;
  }
}
