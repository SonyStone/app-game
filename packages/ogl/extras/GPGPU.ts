import type { AttributeMap } from '../core/geometry';
import { Mesh } from '../core/mesh';
import { Program } from '../core/program';
import { RenderTarget } from '../core/render-target';
import { Texture } from '../core/texture';
import type { OGLRenderingContext } from '../core/renderer';
import type { Geometry } from '../core/geometry';
import { Triangle } from './triangle';

type TextureUniform = {
  value: Texture;
};

type GPGPUPass = {
  mesh: Mesh;
  program: Program;
  uniforms: Record<string, any>;
  enabled: boolean;
  textureUniform: string;
};

type GPGPUOptions = {
  data?: Float32Array;
  geometry?: Geometry;
  type?: GLenum;
};

type GPGPUPassOptions = {
  vertex?: string;
  fragment?: string;
  uniforms?: Record<string, any>;
  textureUniform?: string;
  enabled?: boolean;
};

export class GPGPU {
  gl: OGLRenderingContext;
  passes: GPGPUPass[];
  geometry: Geometry;
  dataLength: number;
  size: number;
  coords: Float32Array;
  uniform: TextureUniform;
  fbo: {
    read: RenderTarget;
    write: RenderTarget;
    swap: () => void;
  };

  constructor(
    gl: OGLRenderingContext,
    {
      // Always pass in array of vec4s (RGBA values within texture)
      data = new Float32Array(16),
      geometry = new Triangle(gl),
      type // Pass in gl.FLOAT to force it, defaults to gl.HALF_FLOAT
    }: GPGPUOptions = {}
  ) {
    this.gl = gl;
    const initialData = data;
    this.passes = [];
    this.geometry = geometry;
    this.dataLength = initialData.length / 4;

    // Windows and iOS only like power of 2 textures
    // Find smallest PO2 that fits data
    this.size = Math.pow(2, Math.ceil(Math.log(Math.ceil(Math.sqrt(this.dataLength))) / Math.LN2));

    // Create coords for output texture
    this.coords = new Float32Array(this.dataLength * 2);
    for (let i = 0; i < this.dataLength; i++) {
      const x = (i % this.size) / this.size; // to add 0.5 to be center pixel ?
      const y = Math.floor(i / this.size) / this.size;
      this.coords.set([x, y], i * 2);
    }

    // Use original data if already correct length of PO2 texture, else copy to new array of correct length
    const floatArray = (() => {
      if (initialData.length === this.size * this.size * 4) {
        return initialData;
      } else {
        const a = new Float32Array(this.size * this.size * 4);
        a.set(initialData);
        return a;
      }
    })();

    // Create output texture uniform using input float texture with initial data
    this.uniform = {
      value: new Texture(gl, {
        image: floatArray,
        target: gl.TEXTURE_2D,
        type: gl.FLOAT,
        format: gl.RGBA,
        internalFormat: gl.RGBA32F,
        wrapS: gl.CLAMP_TO_EDGE,
        wrapT: gl.CLAMP_TO_EDGE,
        generateMipmaps: false,
        minFilter: gl.NEAREST,
        magFilter: gl.NEAREST,
        width: this.size,
        flipY: false
      })
    };

    // Create FBOs
    const options = {
      width: this.size,
      height: this.size,
      type: type || gl.HALF_FLOAT || gl.renderer.extensions['OES_texture_half_float'].HALF_FLOAT_OES,
      format: gl.RGBA,
      internalFormat: type === gl.FLOAT ? gl.RGBA32F : gl.RGBA16F,
      minFilter: gl.NEAREST,
      depth: false,
      unpackAlignment: 1
    };

    this.fbo = {
      read: new RenderTarget(gl, options),
      write: new RenderTarget(gl, options),
      swap: () => {
        let temp = this.fbo.read;
        this.fbo.read = this.fbo.write;
        this.fbo.write = temp;
        this.uniform.value = this.fbo.read.texture;
      }
    };
  }

  addPass({
    vertex = defaultVertex,
    fragment = defaultFragment,
    uniforms = {},
    textureUniform = 'tMap',
    enabled = true
  }: GPGPUPassOptions = {}): GPGPUPass {
    uniforms[textureUniform] = this.uniform;
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

  render(): void {
    const enabledPasses = this.passes.filter((pass) => pass.enabled);

    enabledPasses.forEach((pass: GPGPUPass, i: number) => {
      this.gl.renderer.render({
        scene: pass.mesh,
        target: this.fbo.write,
        clear: false
      });
      this.fbo.swap();
    });
  }
}

const defaultVertex = /* glsl */ `
    attribute vec2 uv;
    attribute vec2 position;

    varying vec2 vUv;

    void main() {
        vUv = uv;
        gl_Position = vec4(position, 0, 1);
    }
`;

const defaultFragment = /* glsl */ `
    precision highp float;

    uniform sampler2D tMap;
    varying vec2 vUv;

    void main() {
        gl_FragColor = texture2D(tMap, vUv);
    }
`;
