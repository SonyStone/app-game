import { onCleanup } from 'solid-js';
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
  on_mouse: (type: number, x: number, y: number, pressure: number) => void
): App {
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

  const box = canvas.getBoundingClientRect();
  const offset_x = box.left; // Help get X,Y in relation to the canvas position.
  const offset_y = box.top;

  function on_mouse_move(e: PointerEvent) {
    let x = e.pageX - offset_x;
    let y = e.pageY - offset_y;
    let pressure = e.pressure;
    on_mouse!(MouseState.MMOVE, x, y, pressure);
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (on_mouse) {
      let x = event.pageX - offset_x;
      let y = event.pageY - offset_y;
      let pressure = event.pressure;

      on_mouse(MouseState.MDOWN, x, y, pressure);
      canvas.addEventListener('pointermove', on_mouse_move);
    }
  });

  canvas.addEventListener('pointerup', (event) => {
    if (on_mouse) {
      canvas.removeEventListener('pointermove', on_mouse_move);

      let x = event.pageX - offset_x;
      let y = event.pageY - offset_y;
      let pressure = event.pressure;

      on_mouse(MouseState.MUP, x, y, pressure);
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
