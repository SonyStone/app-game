import { Renderer } from './renderer';

export class Context {
  body: HTMLElement;
  uniform: WebGLUniformLocation | null = null;

  constructor(public canvas: HTMLCanvasElement) {
    this.body = canvas.parentElement ?? document.body;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  render(renderer: Renderer) {
    if (this.uniform === null) {
      this.uniform = renderer.gl.getUniformLocation(renderer.program, 'u_resolution');
    }

    renderer.gl.uniform2f(this.uniform, renderer.gl.canvas.width, renderer.gl.canvas.height);
  }
}
