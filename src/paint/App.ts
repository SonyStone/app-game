import Buffer from './fungi/Buffer';
import Context from './fungi/Context';
import { Fbo, FboFactory } from './fungi/Fbo';
import Matrix4 from './fungi/Mat4';
import Mesh from './fungi/Mesh';
import Shader from './fungi/Shader';
import Texture from './fungi/Texture';
import Vao from './fungi/Vao';

export default class App {
  //#################################################
  static gl: Context;
  static buffer: Buffer;
  static shader: Shader;
  static vao: Vao;
  static mesh: Mesh;
  static texture: Texture;
  static fbo: FboFactory;

  //#################################################

  static ortho_proj = new Matrix4();
  static main_fbo: Fbo;
  static offset_x = 0;
  static offset_y = 0;

  static on_mouse: (type: number, x: number, y: number) => void;

  static MUP = 0;
  static MDOWN = 1;
  static MMOVE = 2;

  //#################################################

  static init(canvas: HTMLCanvasElement) {
    console.log('[ Sketch.App 0.1 ]');

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // GL CONTEXT
    App.gl = new Context(canvas);
    if (!App.gl.ctx) return false;

    App.gl.set_color('#000000').fit_screen().clear();
    //window.addEventListener( "resize", (e)=>{ App.gl.fit_screen(); });

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // CORE
    App.buffer = new Buffer(App.gl);
    App.texture = new Texture(App.gl);
    App.vao = new Vao(App.gl);
    App.shader = new Shader(App.gl, App.texture);
    App.mesh = new Mesh(App.gl, App.vao, App.buffer, App.shader);
    App.fbo = new FboFactory(App.gl);

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    App.ortho_proj.from_ortho(0, App.gl.width, App.gl.height, 0, -100, 100);

    App.main_fbo = App.fbo.new({
      width: App.gl.width,
      height: App.gl.height,
      buffers: [
        { attach: 0, name: 'color', type: 'color', mode: 'tex', pixel: 'byte' },
      ],
    });

    let box = App.gl.canvas!.getBoundingClientRect();
    App.offset_x = box.left; // Help get X,Y in relation to the canvas position.
    App.offset_y = box.top;

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    let c = App.gl.canvas;
    c.addEventListener('mousedown', (e) => {
      if (App.on_mouse) {
        let x = e.pageX - App.offset_x;
        let y = e.pageY - App.offset_y;

        App.on_mouse(App.MDOWN, x, y);
        c.addEventListener('mousemove', App.on_mouse_move);
      }
    });

    c.addEventListener('mouseup', (e) => {
      if (App.on_mouse) {
        c.removeEventListener('mousemove', App.on_mouse_move);

        let x = e.pageX - App.offset_x;
        let y = e.pageY - App.offset_y;

        App.on_mouse(App.MUP, x, y);
      }
    });

    return true;
  }

  static on_mouse_move(e: MouseEvent) {
    let x = e.pageX - App.offset_x;
    let y = e.pageY - App.offset_y;
    App.on_mouse(App.MMOVE, x, y);
  }
}
