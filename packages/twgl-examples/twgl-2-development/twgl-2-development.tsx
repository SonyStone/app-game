import { createBufferInfoFromArrays } from '@packages/twgl-2/attributes';
import { createProgramInfo } from '@packages/twgl-2/programs/programs';
import { createWebGL2Context } from '@packages/webgl/webgl-objects/context';
import { onMount } from 'solid-js';
import fragmentShaderSource from './shaders/shader.frag?raw';
import vertexShaderSource from './shaders/shader.vert?raw';

export default function Twgl2Development() {
  const canvas = (
    <canvas id="canvas" class="touch-none border border-black" width="800" height="600" />
  ) as HTMLCanvasElement;

  onMount(() => {
    const gl = createWebGL2Context(canvas);

    {
      console.clear();
      const programInfo = createProgramInfo(gl, vertexShaderSource, fragmentShaderSource);
      console.log(`programInfo`, programInfo);

      // prettier-ignore
      const arrays = {
        position: [1, 1, -1, 1, 1, 1, 1, -1, 1, 1, -1, -1, -1, 1, 1, -1, 1, -1, -1, -1, -1, -1, -1, 1, -1, 1, 1, 1, 1, 1, 1, 1, -1, -1, 1, -1, -1, -1, -1, 1, -1, -1, 1, -1, 1, -1, -1, 1, 1, 1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1, -1, 1, -1, 1, 1, -1, 1, -1, -1, -1, -1, -1 ],
        normal: [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1],
        texcoord: [1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1],
        indices: [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11, 12, 13, 14, 12, 14, 15, 16, 17, 18, 16, 18, 19, 20,21, 22, 20, 22, 23]
      };
      const bufferInfo = createBufferInfoFromArrays(gl, arrays);

      console.log(`bufferInfo`, bufferInfo);

      {
        gl.getUniformBlockIndex(programInfo.program, 'Uniforms');
      }
    }
  });

  return (
    <>
      <div>Twgl2Development</div>
      {canvas}
    </>
  );
}
