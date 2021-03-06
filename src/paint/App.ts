import { onCleanup } from 'solid-js';
import { BufferFactory } from './fungi/Buffer';
import { Context } from './fungi/Context';
import { Fbo, FboFactory } from './fungi/Fbo';
import { Matrix4 } from './fungi/Mat4';
import { MeshFactory } from './fungi/Mesh';
import { ShaderFactory } from './fungi/Shader';
import { TextureFactory } from './fungi/Texture';
import { VaoFactory } from './fungi/Vao';

export enum MouseState {
  MUP = 0,
  MDOWN = 1,
  MMOVE = 2,
}

export interface App {
  gl: Context;
  buffer: BufferFactory;
  shader: ShaderFactory;
  fbo: FboFactory;
  main_fbo: Fbo;
  ortho_proj: Matrix4;
  mesh: MeshFactory;
}

export function createApp(canvas: HTMLCanvasElement): App {
  console.log('[ Sketch.App 0.1 ]');

  const gl = new Context(canvas);
  gl.set_color('#000000')
    .set_size(window.innerWidth, window.innerHeight)
    .clear();

  function onWindowResize() {
    gl.set_size(window.innerWidth, window.innerHeight);
  }

  window.addEventListener('resize', onWindowResize);

  onCleanup(() => {
    window.removeEventListener('resize', onWindowResize);
  });

  const ortho_proj = new Matrix4();
  ortho_proj.from_ortho(0, gl.width, gl.height, 0, -100, 100);

  const buffer = new BufferFactory(gl);
  const texture = new TextureFactory(gl);
  const vao = new VaoFactory(gl);
  const shader = new ShaderFactory(gl);
  const mesh = new MeshFactory(gl, vao, buffer, shader);
  const fbo = new FboFactory(gl);

  const main_fbo = fbo.new({
    width: gl.width,
    height: gl.height,
    buffers: [
      { attach: 0, name: 'color', type: 'color', mode: 'tex', pixel: 'byte' },
    ],
  });

  return {
    shader,
    gl,
    fbo,
    main_fbo,
    ortho_proj,
    mesh,
    buffer,
  };
}
