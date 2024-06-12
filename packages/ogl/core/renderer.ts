import {
  BLENDING_FACTOR,
  EXTENSIONS,
  GL_BLEND_EQUATION,
  GL_CAPABILITIES,
  GL_CLEAR_MASK,
  GL_CULL_FACE,
  GL_FRAMEBUFFER_OBJECT,
  GL_FRONT_FACE,
  GL_FUNC_SEPARATE,
  GL_PARAMETER
} from '@packages/webgl/static-variables';
import { Vec3 } from '../math/vec-3';

import { GL_TEXTURE_UNIT } from '@packages/webgl/static-variables/textures';
import type { Camera } from './camera';
import type { Mesh } from './mesh';
import type { RenderTarget } from './render-target';
import type { Transform } from './transform';

// TODO: Handle context loss https://www.khronos.org/webgl/wiki/HandlingContextLost

// Not automatic - devs to use these methods manually
// gl.colorMask( colorMask, colorMask, colorMask, colorMask );
// gl.clearColor( r, g, b, a );
// gl.stencilMask( stencilMask );
// gl.stencilFunc( stencilFunc, stencilRef, stencilMask );
// gl.stencilOp( stencilFail, stencilZFail, stencilZPass );
// gl.clearStencil( stencil );

const tempVec3 = /* @__PURE__ */ new Vec3();
let ID = 1;

export type OGLRenderingContext = WebGL2RenderingContext & {
  renderer: Renderer;
  canvas: HTMLCanvasElement;
};

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  dpr: number;
  alpha: boolean;
  depth: boolean;
  stencil: boolean;
  antialias: boolean;
  premultipliedAlpha: boolean;
  preserveDrawingBuffer: boolean;
  powerPreference: string;
  autoClear: boolean;
  webgl: number;
}

export interface DeviceParameters {
  maxTextureUnits?: number;
  maxAnisotropy?: number;
}

export interface BlendFunc {
  src: BLENDING_FACTOR;
  dst: BLENDING_FACTOR;
  srcAlpha?: GL_FUNC_SEPARATE;
  dstAlpha?: GL_FUNC_SEPARATE;
}

export interface BlendEquation {
  modeRGB: GLenum;
  modeAlpha?: GLenum;
}

export interface Viewport {
  x: number;
  y: number;
  width: number | null;
  height: number | null;
}

export type TextureUnit = (number & { __brand: 'TextureUnit' }) | GL_TEXTURE_UNIT;

export const DEFAULT_TEXTURE_UNITS = 0 as TextureUnit;

export interface RenderState {
  blendFunc: BlendFunc;
  blendEquation: BlendEquation;
  cullFace: GLenum | false | null;
  frontFace: number;
  depthMask: boolean;
  depthFunc: number;
  premultiplyAlpha: boolean;
  flipY: boolean;
  unpackAlignment: number;
  viewport: Viewport;
  textureUnits: TextureUnit[];
  activeTextureUnit: TextureUnit;
  framebuffer: WebGLFramebuffer | null;
  boundBuffer?: WebGLBuffer | null;
  uniformLocations: Map<WebGLUniformLocation, number | number[] | Float32Array>;
  currentProgram: number | null;
  [key: GLenum]: boolean;
}

export interface RendererSortable extends Mesh {
  zDepth: number;
}

/**
 * The WebGL renderer.
 * @see {@link https://github.com/oframe/ogl/blob/master/src/core/Renderer.js | Source}
 */
export class Renderer {
  dpr: number;
  alpha: boolean;
  color: boolean;
  depth: boolean;
  stencil: boolean;
  premultipliedAlpha: boolean;
  autoClear: boolean;
  id: number;

  gl!: OGLRenderingContext;

  state: RenderState;

  extensions: Record<string, any> & {
    EXT_texture_filter_anisotropic: { MAX_TEXTURE_MAX_ANISOTROPY_EXT: number; TEXTURE_MAX_ANISOTROPY_EXT: number };
  };

  parameters: DeviceParameters;

  width!: number;
  height!: number;

  currentGeometry?: string | null; // Set from geometry

  constructor({
    canvas = document.createElement('canvas'),
    width = 300,
    height = 150,
    dpr = 1,
    alpha = false,
    depth = true,
    stencil = false,
    antialias = false,
    premultipliedAlpha = false,
    preserveDrawingBuffer = false,
    powerPreference = 'default',
    autoClear = true
  }: Partial<RendererOptions> = {}) {
    const attributes = { alpha, depth, stencil, antialias, premultipliedAlpha, preserveDrawingBuffer, powerPreference };
    this.dpr = dpr;
    this.alpha = alpha;
    this.color = true;
    this.depth = depth;
    this.stencil = stencil;
    this.premultipliedAlpha = premultipliedAlpha;
    this.autoClear = autoClear;
    this.id = ID++;

    // Attempt WebGL2
    this.gl = canvas.getContext('webgl2', attributes)! as any;
    if (!this.gl) {
      console.error('unable to create webgl 2 context');
    }

    // Attach renderer to gl so that all classes have access to internal state functions
    this.gl.renderer = this;

    // initialise size values
    this.setSize(width, height);

    // gl state stores to avoid redundant calls on methods used internally
    this.state = {
      blendFunc: { src: this.gl.ONE, dst: this.gl.ZERO },
      blendEquation: { modeRGB: GL_BLEND_EQUATION.FUNC_ADD },
      cullFace: false,
      frontFace: this.gl.CCW,
      depthMask: true,
      depthFunc: this.gl.LESS,
      premultiplyAlpha: false,
      flipY: false,
      unpackAlignment: 4,
      framebuffer: null,
      viewport: { x: 0, y: 0, width: null, height: null },
      textureUnits: [],
      activeTextureUnit: DEFAULT_TEXTURE_UNITS,
      boundBuffer: null,
      uniformLocations: new Map(),
      currentProgram: null
    };

    // store requested extensions
    this.extensions = {} as any;

    // Initialise extra format types
    this.getExtension('EXT_color_buffer_float');
    this.getExtension('OES_texture_float_linear');
    this.getExtension('WEBGL_compressed_texture_astc');
    this.getExtension('EXT_texture_compression_bptc');
    this.getExtension('WEBGL_compressed_texture_s3tc');
    this.getExtension('WEBGL_compressed_texture_etc1');
    this.getExtension('WEBGL_compressed_texture_pvrtc');
    this.getExtension('WEBKIT_WEBGL_compressed_texture_pvrtc');

    // Store device parameters
    this.parameters = {};
    this.parameters.maxTextureUnits = this.gl.getParameter(GL_PARAMETER.MAX_COMBINED_TEXTURE_IMAGE_UNITS);
    this.parameters.maxAnisotropy = this.getExtension('EXT_texture_filter_anisotropic')
      ? this.gl.getParameter(
          (this.getExtension('EXT_texture_filter_anisotropic') as any).MAX_TEXTURE_MAX_ANISOTROPY_EXT
        )
      : 0;
  }

  setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    this.gl.canvas.width = width * this.dpr;
    this.gl.canvas.height = height * this.dpr;

    if (!this.gl.canvas.style) {
      return;
    }
    Object.assign(this.gl.canvas.style, {
      width: width + 'px',
      height: height + 'px'
    });
  }

  setViewport(width: number, height: number, x: number = 0, y: number = 0): void {
    if (this.state.viewport.width === width && this.state.viewport.height === height) {
      return;
    }
    this.state.viewport.width = width;
    this.state.viewport.height = height;
    this.state.viewport.x = x;
    this.state.viewport.y = y;
    this.gl.viewport(x, y, width, height);
  }

  /**
   * [scissor](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/scissor)
   */
  setScissor(width: number, height: number, x: number = 0, y: number = 0): void {
    this.gl.scissor(x, y, width, height);
  }

  /**
   * [enable](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/enable)
   */
  enable(id: GL_CAPABILITIES): void {
    if (this.state[id] === true) {
      return;
    }
    this.gl.enable(id);
    this.state[id] = true;
  }

  disable(id: GL_CAPABILITIES): void {
    if (this.state[id] === false) {
      return;
    }
    this.gl.disable(id);
    this.state[id] = false;
  }

  setBlendFunc(
    src: GL_FUNC_SEPARATE,
    dst: GL_FUNC_SEPARATE,
    srcAlpha?: GL_FUNC_SEPARATE,
    dstAlpha?: GL_FUNC_SEPARATE
  ): void {
    if (
      this.state.blendFunc.src === src &&
      this.state.blendFunc.dst === dst &&
      this.state.blendFunc.srcAlpha === srcAlpha &&
      this.state.blendFunc.dstAlpha === dstAlpha
    ) {
      return;
    }

    this.state.blendFunc.src = src;
    this.state.blendFunc.dst = dst;
    this.state.blendFunc.srcAlpha = srcAlpha;
    this.state.blendFunc.dstAlpha = dstAlpha;
    if (srcAlpha !== undefined && dstAlpha !== undefined) {
      this.gl.blendFuncSeparate(src, dst, srcAlpha, dstAlpha);
    } else {
      this.gl.blendFunc(src, dst);
    }
  }

  setBlendEquation(modeRGB: GL_BLEND_EQUATION = GL_BLEND_EQUATION.FUNC_ADD, modeAlpha?: GL_BLEND_EQUATION): void {
    if (this.state.blendEquation.modeRGB === modeRGB && this.state.blendEquation.modeAlpha === modeAlpha) {
      return;
    }
    this.state.blendEquation.modeRGB = modeRGB;
    this.state.blendEquation.modeAlpha = modeAlpha;
    if (modeAlpha !== undefined) {
      this.gl.blendEquationSeparate(modeRGB, modeAlpha);
    } else {
      this.gl.blendEquation(modeRGB);
    }
  }

  setCullFace(value: GL_CULL_FACE): void {
    if (this.state.cullFace === value) {
      return;
    }
    this.state.cullFace = value;
    this.gl.cullFace(value);
  }

  setFrontFace(value: GL_FRONT_FACE): void {
    if (this.state.frontFace === value) {
      return;
    }
    this.state.frontFace = value;
    this.gl.frontFace(value);
  }

  setDepthMask(value: GLboolean): void {
    if (this.state.depthMask === value) {
      return;
    }
    this.state.depthMask = value;
    this.gl.depthMask(value);
  }

  setDepthFunc(value: GLenum): void {
    if (this.state.depthFunc === value) {
      return;
    }
    this.state.depthFunc = value;
    this.gl.depthFunc(value);
  }

  activeTexture(textureUnit: TextureUnit): void {
    if (this.state.activeTextureUnit === textureUnit) {
      return;
    }
    this.state.activeTextureUnit = textureUnit;
    this.gl.activeTexture(this.gl.TEXTURE0 + textureUnit);
  }

  bindFramebuffer({
    target = GL_FRAMEBUFFER_OBJECT.FRAMEBUFFER,
    buffer = null
  }: { target?: GL_FRAMEBUFFER_OBJECT; buffer?: WebGLFramebuffer | null } = {}): void {
    if (this.state.framebuffer === buffer) {
      return;
    }
    this.state.framebuffer = buffer;
    this.gl.bindFramebuffer(target, buffer);
  }

  getExtension(extension: EXTENSIONS): Function | undefined {
    // fetch extension once only
    if (!this.extensions[extension]) {
      this.extensions[extension] = this.gl.getExtension(extension);
    }

    return this.extensions[extension];
  }

  getRenderList({
    scene,
    camera,
    frustumCull,
    sort
  }: {
    scene: Transform;
    camera?: Camera;
    frustumCull: boolean;
    sort: boolean;
  }): Mesh[] {
    let renderList: Mesh[] = [];

    if (camera && frustumCull) {
      camera.updateFrustum();
    }

    // Get visible
    scene.traverse((node) => {
      if (!node.visible) {
        return true;
      }
      if (!(node as Mesh).draw) {
        return;
      }

      if (frustumCull && (node as Mesh).frustumCulled && camera) {
        if (!camera.frustumIntersectsMesh(node as Mesh)) {
          return;
        }
      }

      renderList.push(node as Mesh);
    });

    if (sort) {
      const opaque: RendererSortable[] = [];
      const transparent: RendererSortable[] = []; // depthTest true
      const ui: RendererSortable[] = []; // depthTest false

      for (const node of renderList) {
        // Split into the 3 render groups
        if (!node.program?.transparent) {
          opaque.push(node as RendererSortable);
        } else if (node.program.depthTest) {
          transparent.push(node as RendererSortable);
        } else {
          ui.push(node as RendererSortable);
        }

        (node as RendererSortable).zDepth = 0;

        // Only calculate z-depth if renderOrder unset and depthTest is true
        if (node.renderOrder !== 0 || !node.program.depthTest || !camera) {
          continue;
        }

        // update z-depth
        node.worldMatrix.getTranslation(tempVec3);
        tempVec3.applyMatrix4(camera.projectionViewMatrix);
        node.zDepth = tempVec3.z;
      }

      opaque.sort(sortOpaque);
      transparent.sort(sortTransparent);
      ui.sort(sortUI);

      renderList = opaque.concat(transparent, ui);
    }

    return renderList;
  }

  render({
    scene,
    camera,
    target = undefined,
    update = true,
    sort = true,
    frustumCull = true,
    clear
  }: Partial<{
    scene: Transform;
    camera: Camera;
    target: RenderTarget;
    update: boolean;
    sort: boolean;
    frustumCull: boolean;
    clear: boolean;
  }>): void {
    if (target) {
      // bind supplied render target and update viewport
      this.bindFramebuffer(target);
      this.setViewport(target.width, target.height);
    } else {
      // make sure no render target bound so draws to canvas
      this.bindFramebuffer();
      this.setViewport(this.width * this.dpr, this.height * this.dpr);
    }

    if (clear || (this.autoClear && clear !== false)) {
      // Ensure depth buffer writing is enabled so it can be cleared
      if (this.depth && (!target || target.depth)) {
        this.enable(this.gl.DEPTH_TEST);
        this.setDepthMask(true);
      }

      const mask =
        (this.color ? GL_CLEAR_MASK.COLOR_BUFFER_BIT : 0) |
        (this.depth ? GL_CLEAR_MASK.DEPTH_BUFFER_BIT : 0) |
        (this.stencil ? GL_CLEAR_MASK.STENCIL_BUFFER_BIT : 0);

      this.gl.clear(mask);
    }

    // updates all scene graph matrices
    if (update) {
      scene!.updateMatrixWorld();
    }

    // Update camera separately, in case not in scene graph
    if (camera) {
      camera.updateMatrixWorld();
    }

    // Get render list - entails culling and sorting
    const renderList = this.getRenderList({ scene: scene!, camera, frustumCull, sort });

    for (const node of renderList) {
      node.draw({ camera });
    }
  }
}

const sortUI = (a: RendererSortable, b: RendererSortable): number => {
  if (a.renderOrder !== b.renderOrder) {
    return a.renderOrder - b.renderOrder;
  } else if (a.program.id !== b.program.id) {
    return a.program.id - b.program.id;
  } else {
    return b.id - a.id;
  }
};

const sortTransparent = (a: RendererSortable, b: RendererSortable): number => {
  if (a.renderOrder !== b.renderOrder) {
    return a.renderOrder - b.renderOrder;
  }
  if (a.zDepth !== b.zDepth) {
    return b.zDepth - a.zDepth;
  } else {
    return b.id - a.id;
  }
};

const sortOpaque = (a: RendererSortable, b: RendererSortable): number => {
  if (a.renderOrder !== b.renderOrder) {
    return a.renderOrder - b.renderOrder;
  } else if (a.program.id !== b.program.id) {
    return a.program.id - b.program.id;
  } else if (a.zDepth !== b.zDepth) {
    return a.zDepth - b.zDepth;
  } else {
    return b.id - a.id;
  }
};
