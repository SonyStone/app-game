import { FMat3 } from '@packages/math';
import { GL_BUFFER_USAGE } from '@packages/webgl/static-variables';
import { GL_BUFFER_TARGET } from '@packages/webgl/static-variables/buffer';
import { createWebGL2Renderer } from '@packages/webgl/webgl-objects/context';
import fragmentShaderSource from './fragment-shader.frag?raw';
import vertexShaderSource from './vertex-shader.vert?raw';

export default function PaintApp() {
  const canvas = (<canvas class="w-full aspect-square max-w-1024px" />) as HTMLCanvasElement;

  const gl = createWebGL2Renderer(canvas);

  // create GLSL shaders, upload the GLSL source, compile the shaders
  // Link the two shaders into a program
  const program = gl.createProgram({
    vert: vertexShaderSource,
    frag: fragmentShaderSource,
    attributes: (attribute) => ({
      position: attribute.name('a_position').location
    }),
    uniforms: (uniform) => ({
      matrix: uniform.name('u_matrix').mat3
    })
  })!;

  // Create a buffer and put three 2d clip space points in it
  const positionBuffer = gl
    .createBuffer({
      target: GL_BUFFER_TARGET.ARRAY_BUFFER,
      usage: GL_BUFFER_USAGE.STATIC_DRAW
    })
    .data(new Float32Array([0, 0, 512, 0, 0, 512, 0, 512, 512, 0, 512, 512]))
    .bind();

  const vao = gl.createVertexArray().addBuffer(positionBuffer).attribPointer(program.position, 2, 0, 0);

  canvas.width = 1024;
  canvas.height = 1024;

  // Tell WebGL how to convert from clip space to pixels
  gl.viewport();

  // Clear the canvas
  gl.clear();

  // Tell it to use our program (pair of shaders)
  program.use();

  const matrix = projection(canvas.width, canvas.height).translate([256, 256]);
  program.matrix(matrix);

  // draw
  // Bind the attribute/buffer set we want.
  vao.bind();
  gl.draw.triangles(6);

  return canvas;
}

function projection(width: number, height: number) {
  // Note: This matrix flips the Y axis so that 0 is at the top.
  return new FMat3().set(2 / width, 0, 0, 0, -2 / height, 0, -1, 1, 1);
}
