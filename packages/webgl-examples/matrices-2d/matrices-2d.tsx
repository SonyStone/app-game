import { Vec2 } from '@app-game/math';
import * as m3 from '@app-game/math/m3';
import { BUFFER_DATA_USAGE, BUFFER_TARGET } from '@app-game/webgl/static-variables/buffer';
import { createBuffer } from '@app-game/webgl/webgl-objects/buffer';
import { createWebGL2Renderer } from '@app-game/webgl/webgl-objects/context';
import { createProgram } from '@app-game/webgl/webgl-objects/program';
import { createVertexArray } from '@app-game/webgl/webgl-objects/vertex-array-object';
import { createSignal, onMount } from 'solid-js';
import { effect } from 'solid-js/web';
import fragmentShaderSource from './fragment-shader.frag?raw';
import vertexShaderSource from './vertex-shader.vert?raw';

/**
 *
 * @example
 * ```tsx
 * <Canvas>
 *  <WebGL2 />
 *  <Camera2d />
 *  <Programm />
 * </Canvas>
 * ```
 */

export default function Matrices2d() {
  const canvas = (<canvas class="max-w-600px aspect-square w-full" />) as HTMLCanvasElement;

  const gl = createWebGL2Renderer(canvas);

  const program = createProgram(gl.context as unknown as Parameters<typeof createProgram>[0], {
    vert: vertexShaderSource,
    frag: fragmentShaderSource,
    attributes: (attribute) => ({
      position: attribute.name('a_position')
    }),
    uniforms: (uniform) => ({
      color: uniform.name('u_color').uniform4fv(),
      matrix: uniform.name('u_matrix').mat3()
    })
  }) as ReturnType<typeof createProgram> & {
    position: { location: number };
    color: (value: Float32Array | number[]) => void;
    matrix: (value: m3.FMat3) => void;
  };

  const positionBuffer = createBuffer(gl.context, {
    target: BUFFER_TARGET.ARRAY_BUFFER,
    usage: BUFFER_DATA_USAGE.STATIC_DRAW
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

  const vao = createVertexArray(gl.context).attribPointer(program.position.location, 2, 0, 0);

  const [translation, serTranslation] = createSignal(Vec2.create(150, 100), {
    equals: (a, b) => a.x === b.x && a.y === b.y
  });
  const rotation = 0;
  const scale = Vec2.create(1, 1);
  const color = [Math.random(), Math.random(), Math.random(), 1];

  function drawScene() {
    resizeCanvasToDisplaySize(canvas);
    program.color(color);

    let matrix = projection(canvas.width, canvas.height);
    // TODO: use m3
    // {
    //   matrix = m3.translate(matrix, translation());
    //   matrix = m3.rotateY(matrix, rotation);
    //   matrix = m3.scale(matrix, scale);
    // }

    program.matrix(matrix);

    gl.clear();
    gl.viewport();
    program.use();
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
          serTranslation((vec) => Vec2.create(v, vec.y))
        }
      />
      <RangeInput
        name="y"
        value={translation().y}
        onChange={(v) =>
          serTranslation((vec) => Vec2.create(vec.x, v))
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
  return new m3.FMat3().set(2 / width, 0, 0, 0, -2 / height, 0, -1, 1, 1);
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
