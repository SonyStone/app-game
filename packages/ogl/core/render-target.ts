// TODO: test stencil and depth
import { Texture } from './texture';

import { GL_FRAMEBUFFER_TARGET, GL_RENDERBUFFER_TARGET } from '@packages/webgl/static-variables';
import type { OGLRenderingContext } from './renderer';

export interface RenderTargetOptions {
  /** id for debugging */
  id: number | string;
  width: number;
  height: number;
  target: GL_FRAMEBUFFER_TARGET;
  color: number;
  depth: boolean;
  stencil: boolean;
  depthTexture: boolean;
  wrapS: GLenum;
  wrapT: GLenum;
  minFilter: GLenum;
  magFilter: GLenum;
  type: GLenum;
  format: GLenum;
  internalFormat: GLenum;
  unpackAlignment: number;
  premultiplyAlpha: boolean;
}

let _id = 0;

/**
 * A render target.
 *
 * WebGL framebuffer, texture, and renderbuffer.
 *
 * using Framebuffer:
 * * createFramebuffer
 * * bindFramebuffer
 * * framebufferTexture2D
 * * drawBuffers
 *
 * using Renderbuffer:
 * * createRenderbuffer
 * * bindRenderbuffer
 * * renderbufferStorage
 * * framebufferRenderbuffer
 */
export class RenderTarget {
  id: number | string;
  gl: OGLRenderingContext;
  width: number;
  height: number;
  depth: boolean;
  buffer: WebGLFramebuffer;
  target: number;

  textures: Texture[];
  texture: Texture;
  depthTexture!: Texture;
  depthBuffer!: WebGLRenderbuffer;
  stencilBuffer!: WebGLRenderbuffer;
  depthStencilBuffer!: WebGLRenderbuffer;

  constructor(
    gl: OGLRenderingContext,
    {
      id = _id++,
      width = gl.canvas.width,
      height = gl.canvas.height,
      target = GL_FRAMEBUFFER_TARGET.FRAMEBUFFER,
      color = 1, // number of color attachments
      depth = true,
      stencil = false,
      depthTexture = false, // note - stencil breaks
      wrapS = gl.CLAMP_TO_EDGE,
      wrapT = gl.CLAMP_TO_EDGE,
      minFilter = gl.LINEAR,
      magFilter = minFilter,
      type = gl.UNSIGNED_BYTE,
      format = gl.RGBA,
      internalFormat = format,
      unpackAlignment,
      premultiplyAlpha
    }: Partial<RenderTargetOptions> = {}
  ) {
    this.id = id;
    this.gl = gl;
    this.width = width;
    this.height = height;
    this.depth = depth;
    this.buffer = this.gl.createFramebuffer()!;
    this.target = target;
    this.gl.renderer.bindFramebuffer(this);

    this.textures = [];
    const drawBuffers = [];

    // create and attach required num of color textures
    for (let i = 0; i < color; i++) {
      this.textures.push(
        new Texture(gl, {
          width,
          height,
          wrapS,
          wrapT,
          minFilter,
          magFilter,
          type,
          format,
          internalFormat,
          unpackAlignment,
          premultiplyAlpha,
          flipY: false,
          generateMipmaps: false
        })
      );
      this.textures[i].update();
      this.gl.framebufferTexture2D(
        this.target,
        this.gl.COLOR_ATTACHMENT0 + i,
        this.gl.TEXTURE_2D,
        this.textures[i].texture,
        0 /* level */
      );
      drawBuffers.push(this.gl.COLOR_ATTACHMENT0 + i);
    }

    // For multi-render targets shader access
    if (drawBuffers.length > 1) {
      this.gl.drawBuffers(drawBuffers);
    }

    // alias for majority of use cases
    this.texture = this.textures[0];

    // note depth textures break stencil - so can't use together
    if (depthTexture) {
      this.depthTexture = new Texture(gl, {
        width,
        height,
        minFilter: this.gl.NEAREST,
        magFilter: this.gl.NEAREST,
        format: this.gl.DEPTH_COMPONENT,
        internalFormat: this.gl.DEPTH_COMPONENT16,
        type: this.gl.UNSIGNED_INT
      });
      this.depthTexture.update();
      this.gl.framebufferTexture2D(
        this.target,
        this.gl.DEPTH_ATTACHMENT,
        this.gl.TEXTURE_2D,
        this.depthTexture.texture,
        0 /* level */
      );
    } else {
      // Render buffers
      if (depth && !stencil) {
        this.depthBuffer = this.gl.createRenderbuffer()!;
        this.gl.bindRenderbuffer(GL_RENDERBUFFER_TARGET.RENDERBUFFER, this.depthBuffer);
        this.gl.renderbufferStorage(GL_RENDERBUFFER_TARGET.RENDERBUFFER, this.gl.DEPTH_COMPONENT16, width, height);
        this.gl.framebufferRenderbuffer(this.target, this.gl.DEPTH_ATTACHMENT, this.gl.RENDERBUFFER, this.depthBuffer);
      }

      if (stencil && !depth) {
        this.stencilBuffer = this.gl.createRenderbuffer()!;
        this.gl.bindRenderbuffer(GL_RENDERBUFFER_TARGET.RENDERBUFFER, this.stencilBuffer);
        this.gl.renderbufferStorage(GL_RENDERBUFFER_TARGET.RENDERBUFFER, this.gl.STENCIL_INDEX8, width, height);
        this.gl.framebufferRenderbuffer(
          this.target,
          this.gl.STENCIL_ATTACHMENT,
          this.gl.RENDERBUFFER,
          this.stencilBuffer
        );
      }

      if (depth && stencil) {
        this.depthStencilBuffer = this.gl.createRenderbuffer()!;
        this.gl.bindRenderbuffer(GL_RENDERBUFFER_TARGET.RENDERBUFFER, this.depthStencilBuffer);
        this.gl.renderbufferStorage(GL_RENDERBUFFER_TARGET.RENDERBUFFER, this.gl.DEPTH_STENCIL, width, height);
        this.gl.framebufferRenderbuffer(
          this.target,
          this.gl.DEPTH_STENCIL_ATTACHMENT,
          this.gl.RENDERBUFFER,
          this.depthStencilBuffer
        );
      }
    }

    this.gl.renderer.bindFramebuffer({ target: this.target });
  }

  setSize(width: number, height: number): void {
    if (this.width === width && this.height === height) return;

    this.width = width;
    this.height = height;
    this.gl.renderer.bindFramebuffer(this);

    for (let i = 0; i < this.textures.length; i++) {
      this.textures[i].width = width;
      this.textures[i].height = height;
      this.textures[i].needsUpdate = true;
      this.textures[i].update();
      this.gl.framebufferTexture2D(
        this.target,
        this.gl.COLOR_ATTACHMENT0 + i,
        this.gl.TEXTURE_2D,
        this.textures[i].texture,
        0 /* level */
      );
    }

    if (this.depthTexture) {
      this.depthTexture.width = width;
      this.depthTexture.height = height;
      this.depthTexture.needsUpdate = true;
      this.depthTexture.update();
      this.gl.framebufferTexture2D(
        this.target,
        this.gl.DEPTH_ATTACHMENT,
        this.gl.TEXTURE_2D,
        this.depthTexture.texture,
        0 /* level */
      );
    } else {
      if (this.depthBuffer) {
        this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, this.depthBuffer);
        this.gl.renderbufferStorage(this.gl.RENDERBUFFER, this.gl.DEPTH_COMPONENT16, width, height);
      }

      if (this.stencilBuffer) {
        this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, this.stencilBuffer);
        this.gl.renderbufferStorage(this.gl.RENDERBUFFER, this.gl.STENCIL_INDEX8, width, height);
      }

      if (this.depthStencilBuffer) {
        this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, this.depthStencilBuffer);
        this.gl.renderbufferStorage(this.gl.RENDERBUFFER, this.gl.DEPTH_STENCIL, width, height);
      }
    }

    this.gl.renderer.bindFramebuffer({ target: this.target });
  }
}
