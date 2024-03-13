import { FMat3, Vec2 } from '@packages/math';
import { GL_BUFFER_USAGE } from '@packages/webgl/static-variables';
import { GL_BUFFER_TARGET } from '@packages/webgl/static-variables/buffer';
import { createWebGL2Renderer } from '@packages/webgl/webgl-objects/context';
import { createSignal, onMount } from 'solid-js';
import { effect } from 'solid-js/web';
import { vec4 } from 'wgpu-matrix';
import fragmentShaderSource from './fragment-shader.frag?raw';
import vertexShaderSource from './vertex-shader.vert?raw';

export default function Matrices2d() {
  const canvas = (<canvas class="w-full aspect-square max-w-600px" />) as HTMLCanvasElement;

  const gl = createWebGL2Renderer(canvas);

  const program = gl.createProgram({
    vert: vertexShaderSource,
    frag: fragmentShaderSource,
    attributes: (attribute) => ({
      position: attribute.name('a_position').location
    }),
    uniforms: (uniform) => ({
      color: uniform.name('u_color').uniform4fv,
      matrix: uniform.name('u_matrix').mat3
    })
  });

  const positionBuffer = gl
    .createBuffer({
      target: GL_BUFFER_TARGET.ARRAY_BUFFER,
      usage: GL_BUFFER_USAGE.STATIC_DRAW
    })
    .data(
      new Float32Array([
        // left column
        0, 0, 30, 0, 0, 150, 0, 150, 30, 0, 30, 150,

        // top rung
        30, 0, 100, 0, 30, 30, 30, 30, 100, 0, 100, 30,

        // middle rung
        30, 60, 67, 60, 30, 90, 30, 90, 67, 60, 67, 90
      ])
    )
    .bind();

  const vao = gl.createVertexArray().attribPointer(program.position, 2, 0, 0);

  const [translation, serTranslation] = createSignal(Vec2.create(150, 100), {
    equals: (a, b) => !a.equals(b)
  });
  const rotation = 0;
  const scale = Vec2.create(1, 1);
  const color = vec4.create(Math.random(), Math.random(), Math.random(), 1);

  function drawScene() {
    resizeCanvasToDisplaySize(canvas);
    gl.clear();
    gl.viewport();
    program.use();
    program.color(color);
    const matrix = projection(canvas.width, canvas.height).translate(translation()).rotateY(rotation).scale(scale);
    program.matrix(matrix);
    vao.bind();
    gl.draw.triangles(18);
  }

  onMount(() => {
    effect(() => {
      drawScene();
    });
  });

  return (
    <>
      <RangeInput
        name="x"
        value={translation().x}
        onChange={(v) =>
          serTranslation((vec) => {
            vec.x = v;
            return vec;
          })
        }
      />
      <RangeInput
        name="y"
        value={translation().y}
        onChange={(v) =>
          serTranslation((vec) => {
            vec.y = v;
            return vec;
          })
        }
      />
      {canvas}
    </>
  );
}

function RangeInput(props: { value: number; onChange: (v: number) => void; name: string }) {
  return (
    <div class="flex">
      {props.name}
      <input type="range" min="0" max="569" value={props.value} onInput={(e) => props.onChange(numberInput(e))} />
      {props.value}
    </div>
  );
}

function projection(width: number, height: number) {
  // Note: This matrix flips the Y axis so that 0 is at the top.
  return new FMat3().set(2 / width, 0, 0, 0, -2 / height, 0, -1, 1, 1);
}

/**
 * Resize a canvas to match the size its displayed.
 * @param {HTMLCanvasElement} canvas The canvas to resize.
 * @param {number} [multiplier] amount to multiply by.
 *    Pass in window.devicePixelRatio for native pixels.
 * @return {boolean} true if the canvas was resized.
 * @memberOf module:webgl-utils
 */
function resizeCanvasToDisplaySize(canvas: HTMLCanvasElement, multiplier = 1) {
  const width = (canvas.clientWidth * multiplier) | 0;
  const height = (canvas.clientHeight * multiplier) | 0;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    return true;
  }
  return false;
}

function numberInput(
  e: InputEvent & {
    currentTarget: HTMLInputElement;
    target: HTMLInputElement;
  }
) {
  return parseFloat(e.target.value);
}
