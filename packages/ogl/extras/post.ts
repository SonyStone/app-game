import { Mesh } from '../core/mesh';
import { Program } from '../core/program';
import { RenderTarget } from '../core/render-target';
import { Triangle } from './triangle';

import { Camera } from '../core/camera';
import { Geometry } from '../core/geometry';
import { OGLRenderingContext } from '../core/renderer';
import { Texture } from '../core/texture';
import { Transform } from '../core/transform';
import defaultFragment from './post.frag?raw';
import defaultVertex from './post.vert?raw';
export class Post {
  gl: OGLRenderingContext;
  geometry: Geometry;
  width!: number;
  height!: number;
  dpr!: number;
  resolutionWidth: number;
  resolutionHeight: number;
  fbo: {
    read: RenderTarget;
    write: RenderTarget;
    swap: () => void;
  };
  passes: any[];
  uniform: { value: any };
  targetOnly: any;

  constructor(
    gl: OGLRenderingContext,
    {
      width = undefined as number | undefined,
      height = undefined as number | undefined,
      dpr = undefined as number | undefined,
      wrapS = gl.CLAMP_TO_EDGE,
      wrapT = gl.CLAMP_TO_EDGE,
      minFilter = gl.LINEAR,
      magFilter = gl.LINEAR,
      geometry = new Triangle(gl),
      targetOnly = null
    } = {}
  ) {
    this.gl = gl;

    this.passes = [];

    this.geometry = geometry;

    this.uniform = { value: null };
    this.targetOnly = targetOnly;

    if (dpr) {
      this.dpr = dpr;
    }
    if (width) {
      this.width = width;
    }
    if (height) {
      this.height = height;
    }

    dpr = this.dpr || this.gl.renderer.dpr;
    this.resolutionWidth = Math.floor(this.width || this.gl.renderer.width * dpr);
    this.resolutionHeight = Math.floor(this.height || this.gl.renderer.height * dpr);

    let options = {
      dpr: this.dpr,
      width: this.resolutionWidth,
      height: this.resolutionHeight,
      wrapS,
      wrapT,
      minFilter,
      magFilter
    };

    const fbo = (this.fbo = {
      read: new RenderTarget(this.gl, options),
      write: new RenderTarget(this.gl, options),
      swap: () => {
        let temp = fbo.read;
        fbo.read = fbo.write;
        fbo.write = temp;
      }
    });
  }

  addPass({
    vertex = defaultVertex,
    fragment = defaultFragment,
    uniforms = {} as {
      [key: string]: { value: any };
    },
    textureUniform = 'tMap',
    enabled = true
  } = {}) {
    uniforms[textureUniform] = { value: this.fbo.read.texture };

    const program = new Program(this.gl, { vertex, fragment, uniforms });
    const mesh = new Mesh(this.gl, { geometry: this.geometry, program });

    const pass = {
      mesh,
      program,
      uniforms,
      enabled,
      textureUniform
    };

    this.passes.push(pass);
    return pass;
  }

  resize({
    width = undefined as number | undefined,
    height = undefined as number | undefined,
    dpr = undefined as number | undefined
  } = {}) {
    if (dpr) {
      this.dpr = dpr;
    }
    if (width) {
      this.width = width;
    }
    if (height) {
      this.height = height;
    }

    dpr = this.dpr || this.gl.renderer.dpr;
    this.resolutionWidth = Math.floor(this.width || this.gl.renderer.width * dpr);
    this.resolutionHeight = Math.floor(this.height || this.gl.renderer.height * dpr);

    this.fbo.read.setSize(this.resolutionWidth, this.resolutionHeight);
    this.fbo.write.setSize(this.resolutionWidth, this.resolutionHeight);
  }

  // Uses same arguments as renderer.render, with addition of optional texture passed in to avoid scene render
  render({
    scene,
    camera,
    texture,
    target = undefined,
    update = true,
    sort = true,
    frustumCull = true,
    beforePostCallbacks
  }: {
    scene: Transform;
    camera: Camera;
    texture: Texture;
    target?: RenderTarget;
    update: boolean;
    sort: boolean;
    frustumCull: boolean;
    beforePostCallbacks: (() => {})[];
  }) {
    const enabledPasses = this.passes.filter((pass) => pass.enabled);

    if (!texture) {
      this.gl.renderer.render({
        scene,
        camera,
        target: enabledPasses.length || (!target && this.targetOnly) ? this.fbo.write : target,
        update,
        sort,
        frustumCull
      });
      this.fbo.swap();

      // Callback after rendering scene, but before post effects
      if (beforePostCallbacks) {
        beforePostCallbacks.forEach((f) => f && f());
      }
    }

    enabledPasses.forEach((pass, i) => {
      pass.mesh.program.uniforms[pass.textureUniform].value = !i && texture ? texture : this.fbo.read.texture;
      this.gl.renderer.render({
        scene: pass.mesh,
        target: i === enabledPasses.length - 1 && (target || !this.targetOnly) ? target : this.fbo.write,
        clear: true
      });
      this.fbo.swap();
    });

    this.uniform.value = this.fbo.read.texture;
  }
}
