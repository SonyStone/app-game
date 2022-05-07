import { BufferFactory } from './fungi/Buffer';
import Context from './fungi/Context';
import { Fbo, FboFactory } from './fungi/Fbo';
import Matrix4 from './fungi/Mat4';
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

export function createApp(
  canvas: HTMLCanvasElement,
  on_mouse: (type: number, x: number, y: number) => void
): App {
  console.log('[ Sketch.App 0.1 ]');

  const gl = new Context(canvas);
  gl.set_color('#000000').fit_screen().clear();

  const ortho_proj = new Matrix4();
  ortho_proj.from_ortho(0, gl.width, gl.height, 0, -100, 100);

  const buffer = new BufferFactory(gl);
  const texture = new TextureFactory(gl);
  const vao = new VaoFactory(gl);
  const shader = new ShaderFactory(gl, texture);
  const mesh = new MeshFactory(gl, vao, buffer, shader);
  const fbo = new FboFactory(gl);

  const main_fbo = fbo.new({
    width: gl.width,
    height: gl.height,
    buffers: [
      { attach: 0, name: 'color', type: 'color', mode: 'tex', pixel: 'byte' },
    ],
  });

  let box = gl.canvas!.getBoundingClientRect();
  const offset_x = box.left; // Help get X,Y in relation to the canvas position.
  const offset_y = box.top;

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  function on_mouse_move(e: MouseEvent) {
    let x = e.pageX - offset_x;
    let y = e.pageY - offset_y;
    on_mouse!(MouseState.MMOVE, x, y);
  }

  let c = gl.canvas;
  c.addEventListener('pointerdown', (e) => {
    if (on_mouse) {
      let x = e.pageX - offset_x;
      let y = e.pageY - offset_y;

      on_mouse(MouseState.MDOWN, x, y);
      c.addEventListener('pointermove', on_mouse_move);
    }
  });

  c.addEventListener('pointerup', (e) => {
    if (on_mouse) {
      c.removeEventListener('pointermove', on_mouse_move);

      let x = e.pageX - offset_x;
      let y = e.pageY - offset_y;

      on_mouse(MouseState.MUP, x, y);
    }
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
