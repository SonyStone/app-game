import { GL_BUFFER_USAGE } from '@packages/webgl/static-variables';
import { GL_BUFFER_TARGET } from '@packages/webgl/static-variables/buffer';
import { createWebGL2Renderer } from '@packages/webgl/webgl-objects/context';
import fragmentShaderSource from './fragment-shader.frag?raw';
import vertexShaderSource from './vertex-shader.vert?raw';

export default function SimpleProgram() {
  const canvas = (<canvas class="w-full aspect-square max-w-600px" />) as HTMLCanvasElement;

  const gl = createWebGL2Renderer(canvas);

  // create GLSL shaders, upload the GLSL source, compile the shaders
  // Link the two shaders into a program
  const program = gl.createProgram({
    vert: vertexShaderSource,
    frag: fragmentShaderSource,
    attributes: (attribute) => ({
      position: attribute.name('a_position').location
    })
  })!;

  // Create a buffer and put three 2d clip space points in it
  const positionBuffer = gl
    .createBuffer({
      target: GL_BUFFER_TARGET.ARRAY_BUFFER,
      usage: GL_BUFFER_USAGE.STATIC_DRAW
    })
    .data(new Float32Array([0, 0, 0, 0.5, 0.7, 0]))
    .bind();

  const vao = gl.createVertexArray().addBuffer(positionBuffer).attribPointer(program.position, 2, 0, 0);

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
