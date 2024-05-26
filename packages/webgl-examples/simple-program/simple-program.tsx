import { BUFFER_DATA_USAGE, BUFFER_TARGET } from '@packages/webgl/static-variables/buffer';
import { createWebGL2Renderer } from '@packages/webgl/webgl-objects/context';
import { AttributesParams, createProgram } from '@packages/webgl/webgl-objects/program';
import fragmentShaderSource from './fragment-shader.frag?raw';
import vertexShaderSource from './vertex-shader.vert?raw';

export default function SimpleProgram() {
  const canvas = (<canvas class="max-w-600px aspect-square w-full" />) as HTMLCanvasElement;

  // we can set up all data in one object
  // and the pass it to webgl-objects/program
  const data = {
    vert: vertexShaderSource,
    frag: fragmentShaderSource,
    attributes: (attribute: AttributesParams) => ({
      position: attribute.name('a_position').location
    }),
    target: BUFFER_TARGET.ARRAY_BUFFER,
    usage: BUFFER_DATA_USAGE.STATIC_DRAW,
    data: new Float32Array([0, 0, 0, 0.5, 0.7, 0])
  };

  const gl = createWebGL2Renderer(canvas);

  // create GLSL shaders, upload the GLSL source, compile the shaders
  // Link the two shaders into a program
  const program = createProgram(gl.context, data);

  // Create a buffer and put three 2d clip space points in it
  const positionBuffer = gl.createBuffer(data).data(data.data).bind();

  const vao = gl.createVertexArray().addBuffer(positionBuffer.buffer!).attribPointer(program.position, 2, 0, 0);

  // Tell WebGL how to convert from clip space to pixels
  gl.viewport();

  // Clear the canvas
  gl.clear();

  // Tell it to use our program (pair of shaders)
  program.use();

  // draw
  // Bind the attribute/buffer set we want.
  vao.bind();
  gl.draw.triangles(3);

  return canvas;
}
