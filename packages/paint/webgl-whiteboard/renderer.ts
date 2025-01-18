import { Camera } from './camera';
import { Color } from './color';
import { Context } from './context';
import { DotManager } from './dot-manager';
import fragmentShaderSource from './fragment.frag?raw';
import * as _program from './program';
import * as shader from './shader';
import { flatten } from './utils';
import { Vector } from './vector';
import vertexShaderSource from './vertex.vert?raw';

export class Renderer {
  gl: WebGL2RenderingContext; // @TODO: make private
  colorBuffer: WebGLBuffer;
  vectorsBuffer: WebGLBuffer;
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  vectorBufferData: number[] = [];
  colorBufferData: number[] = [];

  constructor(
    canvas: HTMLCanvasElement,
    public context: Context,
    public camera: Camera,
    public dotManager: DotManager
  ) {
    const gl = canvas.getContext('webgl2') as WebGL2RenderingContext;

    if (!gl) {
      throw new Error('WebGL is not supported.');
    }

    const vertexShader = shader.create(gl, gl.VERTEX_SHADER, vertexShaderSource);

    const fragmentShader = shader.create(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

    if (!vertexShader || !fragmentShader) {
      throw new Error('Error creating shaders');
    }

    const program = _program.create(gl, vertexShader, fragmentShader);

    if (!program) {
      throw new Error('Error creating WebGL program.');
    }

    gl.useProgram(program);

    this.gl = gl;

    const colorBuffer = gl.createBuffer();
    const vectorsBuffer = gl.createBuffer();

    if (!colorBuffer || !vectorsBuffer) {
      throw new Error('Error creating WebGL buffers');
    }

    this.colorBuffer = colorBuffer;
    this.vectorsBuffer = vectorsBuffer;
    this.program = program;

    const vao = gl.createVertexArray();

    if (!vao) {
      throw new Error('Error creating vertex array');
    }
    this.vao = vao;
    gl.bindVertexArray(this.vao);

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  }

  setVectorsAttributePointer() {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vectorsBuffer);
    const positionAttribute = this.gl.getAttribLocation(this.program, 'a_position');
    this.gl.enableVertexAttribArray(positionAttribute);

    // @TODO: It seems if we normalise these values, the data
    // remains unchanged - why? Due to float?
    this.gl.vertexAttribPointer(positionAttribute, 2, this.gl.FLOAT, false, 0, 0);
  }

  setColorsAttributePointer() {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.colorBuffer);
    const colorAttribute = this.gl.getAttribLocation(this.program, 'a_color');

    this.gl.enableVertexAttribArray(colorAttribute);
    this.gl.vertexAttribPointer(colorAttribute, 4, this.gl.UNSIGNED_BYTE, true, 0, 0);
  }

  bufferColors(colors: Color[]) {
    const colorCountToAdd = colors.length - this.colorBufferData.length / 4;
    let offset = colors.length - colorCountToAdd;

    while (offset < colors.length) {
      const color = colors[offset];

      this.colorBufferData.push(color.r);
      this.colorBufferData.push(color.g);
      this.colorBufferData.push(color.b);
      this.colorBufferData.push(color.a);

      offset++;
    }

    const data = new Uint8Array(this.colorBufferData);

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.colorBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, data, this.gl.STATIC_DRAW);
  }

  bufferVectors(vectors: Vector[]) {
    const vectorCountToAdd = vectors.length - this.vectorBufferData.length / 2;
    let offset = vectors.length - vectorCountToAdd;

    while (offset < vectors.length) {
      const vector = vectors[offset];

      this.vectorBufferData.push(vector.x);
      this.vectorBufferData.push(vector.y);

      offset++;
    }

    const bufferData = new Float32Array(this.vectorBufferData);

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vectorsBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, bufferData, this.gl.STATIC_DRAW);
  }

  // @TODO: add vao and transform uniform as class member.
  render = () => {
    this.gl.clearColor(255, 255, 255, 0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

    this.context.render(this);

    this.camera.render(this);

    const verts = this.dotManager.dots.map((dot) => dot.mesh.vectors).reduce(flatten, []);

    const colors = this.dotManager.dots.map((dot) => dot.mesh.colors).reduce(flatten, []);

    const t1 = performance.now();

    this.bufferVectors(verts);
    this.bufferColors(colors);

    const t2 = performance.now();
    // console.log('timetaken:', t2 - t1 + 'ms');
    this.dotManager.render(this);
  };
}
