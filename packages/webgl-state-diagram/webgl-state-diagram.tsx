import { ComponentProps, For } from 'solid-js';
import { WebGL2DebugWrapper } from './gl-debug-wrapper';

declare module 'solid-js' {
  namespace JSX {
    interface IntrinsicElements {
      diagram: ComponentProps<'div'>;
      draggable: ComponentProps<'div'>;
    }
  }
}

/**
 * https://webgl2fundamentals.org/webgl/lessons/resources/webgl-state-diagram.html?exampleId=smallest-glsl
 */
export default () => {
  const canvas = (<canvas class="block bg-white"></canvas>) as HTMLCanvasElement;

  const gl = new WebGL2DebugWrapper(canvas.getContext('webgl2')!);

  const vsGLSL = `#version 300 es
  void main() {
      gl_Position = vec4(0, 0, 0, 1);
      gl_PointSize = 100.0;
  }
  `;

  const fsGLSL = `#version 300 es
  precision highp float;

  out vec4 outColor;

  void main() {
      outColor = vec4(1, 0.5, 0, 1);
  }
  `;

  const vertexShader = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vertexShader, vsGLSL);
  gl.compileShader(vertexShader);
  if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(vertexShader)!);
  }

  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(fragmentShader, fsGLSL);
  gl.compileShader(fragmentShader);
  if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(fragmentShader)!);
  }

  const prg = gl.createProgram()!;
  gl.attachShader(prg, vertexShader);
  gl.attachShader(prg, fragmentShader);
  gl.linkProgram(prg);
  if (!gl.getProgramParameter(prg, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(prg)!);
  }

  gl.useProgram(prg);

  // draw 1 point
  gl.drawArrays(gl.POINTS, 0, 1);

  console.log(`gl`, gl.state);

  const commonState = [
    ['VIEWPORT', gl.state.globalState.commonState.VIEWPORT.toString()],
    ['ARRAY_BUFFER_BINDING', gl.state.globalState.commonState.ARRAY_BUFFER_BINDING ?? 'null'],
    ['CURRENT_PROGRAM', gl.state.globalState.commonState.CURRENT_PROGRAM?.toString() ?? 'null'],
    ['VERTEX_ARRAY_BINDING', gl.state.globalState.commonState.VERTEX_ARRAY_BINDING ?? 'null (default VAO)'],
    ['RENDERBUFFER_BINDING', gl.state.globalState.commonState.RENDERBUFFER_BINDING ?? 'null'],
    ['DRAW_FRAMEBUFFER_BINDING', 'null (canvas)'],
    ['READ_FRAMEBUFFER_BINDING', 'null (canvas)'],
    ['ACTIVE_TEXTURE', gl.state.globalState.commonState.ACTIVE_TEXTURE]
  ] as const;

  return (
    <diagram class="h-full flex font-mono">
      <draggable class="bg-[#005566cc] max-h-95vh overscroll-auto block border text-white">
        <div class="font-bold text-center pb-1 bg-gradient-to-b from-[#ffffff4d] from-50% to-[#00000000] to-50% bg-[length:100%_2px] block">
          canvas
        </div>
        {canvas}
      </draggable>

      <draggable class="bg-[#4d0000cc] max-h-95vh overscroll-auto block border text-white">
        <div class="font-bold text-center pb-1 bg-gradient-to-b from-[#ffffff4d] from-50% to-[#00000000] to-50% bg-[length:100%_2px] block">
          global state
        </div>
        <div>
          <label>common state</label>
          <table>
            <tbody>
              <For each={commonState}>
                {(item) => (
                  <tr>
                    <td class="border border-#ffffff80 p-1 whitespace-pre">{item[0]}</td>
                    <td class="border border-#ffffff80 p-1 whitespace-pre">{item[1]}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </draggable>
    </diagram>
  );
};
