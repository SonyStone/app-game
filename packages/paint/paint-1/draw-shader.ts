import { createProgram } from '@packages/webgl/createProgram';
import {
  GL_BUFFER_USAGE,
  GL_DATA_TYPE,
  GL_DRAW_ARRAYS_MODE,
  GL_DRAW_ELEMENTS_TYPE
} from '@packages/webgl/static-variables';
import { GL_BUFFER_TARGET } from '@packages/webgl/static-variables/buffer';
import { WebGL2RenderingContextStrict } from '@packages/webgl/webgl-strict-types/webgl2';
import { getWireframeIndex } from './create-brush-mesh';
import drawShaderFragSrc from './draw-shader.frag?raw';
import drawShaderVertSrc from './draw-shader.vert?raw';

export class DrawShader {
  program = createProgram(this.gl, drawShaderVertSrc, drawShaderFragSrc);
  private orthoLoc = this.gl.getUniformLocation(this.program, 'ortho');
  private brushSizeLoc = this.gl.getUniformLocation(this.program, 'brush_size');
  private boundLoc = this.gl.getUniformLocation(this.program, 'bound');
  private segmentLoc = this.gl.getUniformLocation(this.program, 'segment');

  constructor(private gl: WebGL2RenderingContextStrict) {}

  useProgram() {
    this.gl.useProgram(this.program);
  }

  clearProgram() {
    this.gl.useProgram(null);
  }

  ortho(ortho: Iterable<number>) {
    this.gl.uniformMatrix4fv(this.orthoLoc, false, ortho);
  }

  brushSize(size: number) {
    this.gl.uniform1f(this.brushSizeLoc, size);
  }

  bound(bound: Float32Array) {
    this.gl.uniform4fv(this.boundLoc, bound);
  }

  segment(segment: Float32Array) {
    this.gl.uniform4fv(this.segmentLoc, segment);
  }
}

// 32 Bit = 4 Bytes
const BYTE = 4;

class Quad {
  // prettier-ignore
  readonly data = new Float32Array([
    //x, y, z   u, v
      0, 0, 0,  0, 0,
      0, 1, 0,  0, 1,
      1, 1, 0,  1, 1,
      1, 0, 0,  1, 0
  ]);

  private readonly indices = new Uint16Array([0, 1, 2, 2, 3, 0]);
  readonly count = this.indices.length;
  readonly type = GL_DRAW_ELEMENTS_TYPE.UNSIGNED_SHORT;

  constructor(private gl: WebGL2RenderingContext) {
    const usage = GL_BUFFER_USAGE.STATIC_DRAW;

    {
      const target = GL_BUFFER_TARGET.ARRAY_BUFFER;
      const buffer = this.gl.createBuffer();
      this.gl.bindBuffer(target, buffer);
      this.gl.bufferData(target, this.data, usage);

      {
        const index = 0;
        const size = 3;
        const type = GL_DATA_TYPE.FLOAT;
        const normalized = false;
        const stride = 5 * BYTE;
        const offset = 0 * BYTE;
        this.gl.enableVertexAttribArray(index);
        this.gl.vertexAttribPointer(index, size, type, normalized, stride, offset);
      }

      {
        const index = 2;
        const size = 2;
        const type = GL_DATA_TYPE.FLOAT;
        const normalized = false;
        const stride = 5 * BYTE;
        const offset = 3 * BYTE;
        this.gl.enableVertexAttribArray(index);
        this.gl.vertexAttribPointer(index, size, type, normalized, stride, offset);
      }
    }

    {
      const target = GL_BUFFER_TARGET.ELEMENT_ARRAY_BUFFER;
      const buffer = this.gl.createBuffer();
      this.gl.bindBuffer(target, buffer);
      this.gl.bufferData(target, this.indices, usage);
    }
  }
}

export class BrushMesh {
  private vao = this.gl.createVertexArray()!;
  private wireframeVao = this.gl.createVertexArray()!;
  private indices = new Uint16Array([0, 1, 2, 2, 3, 0]);
  private wireframeIndices = getWireframeIndex(this.indices);

  // prettier-ignore
  private data = new Float32Array([
  //x, y, z   u, v
    0, 0, 0,  0, 0,
    0, 1, 0,  0, 1,
    1, 1, 0,  1, 1,
    1, 0, 0,  1, 0
  ]);

  constructor(
    private gl: WebGL2RenderingContext,
    private program: WebGLProgram
  ) {
    this.gl.bindVertexArray(this.vao);

    // Create the buffer
    // Set the attribute pointers
    // Create the element buffer
    {
      const target = GL_BUFFER_TARGET.ARRAY_BUFFER;
      const buffer = this.gl.createBuffer();
      const usage = GL_BUFFER_USAGE.STATIC_DRAW;
      this.gl.bindBuffer(target, buffer);
      this.gl.bufferData(target, this.data, usage);
    }
    {
      const index = 0;
      const size = 3;
      const type = GL_DATA_TYPE.FLOAT;
      const normalized = false;
      const stride = 5 * BYTE;
      const offset = 0 * BYTE;
      this.gl.enableVertexAttribArray(index);
      this.gl.vertexAttribPointer(index, size, type, normalized, stride, offset);
    }

    {
      const index = 2;
      const size = 2;
      const type = GL_DATA_TYPE.FLOAT;
      const normalized = false;
      const stride = 5 * BYTE;
      const offset = 3 * BYTE;
      this.gl.enableVertexAttribArray(index);
      this.gl.vertexAttribPointer(index, size, type, normalized, stride, offset);
    }

    {
      const target = GL_BUFFER_TARGET.ELEMENT_ARRAY_BUFFER;
      const buffer = this.gl.createBuffer();
      const usage = GL_BUFFER_USAGE.STATIC_DRAW;
      this.gl.bindBuffer(target, buffer);
      this.gl.bufferData(target, this.indices, usage);
    }

    this.gl.bindVertexArray(this.wireframeVao);

    {
      const target = GL_BUFFER_TARGET.ARRAY_BUFFER;
      const usage = GL_BUFFER_USAGE.STATIC_DRAW;
      const buffer = this.gl.createBuffer();
      this.gl.bindBuffer(target, buffer);
      this.gl.bufferData(target, this.data, usage);
    }
    {
      const index = this.gl.getAttribLocation(this.program, 'a_pos');
      const size = 3;
      const type = GL_DATA_TYPE.FLOAT;
      const normalized = false;
      const stride = 5 * BYTE;
      const offset = 0 * BYTE;
      this.gl.enableVertexAttribArray(index);
      this.gl.vertexAttribPointer(index, size, type, normalized, stride, offset);
    }

    {
      const target = GL_BUFFER_TARGET.ELEMENT_ARRAY_BUFFER;
      const usage = GL_BUFFER_USAGE.STATIC_DRAW;
      const buffer = this.gl.createBuffer();
      this.gl.bindBuffer(target, buffer);
      this.gl.bufferData(target, this.wireframeIndices, usage);
    }

    this.gl.bindVertexArray(null);
  }

  draw() {
    this.gl.bindVertexArray(this.vao);
    const mode = GL_DRAW_ARRAYS_MODE.TRIANGLES;
    const count = this.indices.length;
    const type = GL_DRAW_ELEMENTS_TYPE.UNSIGNED_SHORT;
    const offset = 0;
    this.gl.drawElements(mode, count, type, offset);
    this.gl.bindVertexArray(null);
  }

  drawWireframe() {
    this.gl.bindVertexArray(this.wireframeVao);

    // Draw the wireframe
    this.gl.drawElements(
      GL_DRAW_ARRAYS_MODE.LINES,
      this.wireframeIndices.length,
      GL_DRAW_ELEMENTS_TYPE.UNSIGNED_SHORT,
      0
    );

    this.gl.bindVertexArray(null);
  }
}
