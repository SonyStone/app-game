import * as v4 from '@packages/math/v4';
import { GL_BUFFER_TYPE, GL_BUFFER_USAGE, GL_CLEAR_MASK } from '@packages/webgl/static-variables';
import { DRAW_MODES } from 'pixi.js';
import { onCleanup } from 'solid-js';

import { main } from './graphics';
import { draw } from './webgl/draw';
import { getGeometry } from './webgl/geometry';
import { getProgram } from './webgl/program';
import fragmentSrc from './webgl/shaders/frag_shader.frag?raw';
import vertexSrc from './webgl/shaders/vert_shader.vert?raw';
import { setVertexArrayObject } from './webgl/vertexArrayObject';

export default function MyPixijs() {
  const canvas = (<canvas></canvas>) as HTMLCanvasElement;

  // create and activate Vertex Array Object

  const { indices, points } = main();

  const p: number[] = [];
  for (let index = 0; index < points.length; ) {
    p.push(points[index]);
    p.push(points[index + 1]);
    p.push(0);
    index = index + 2;
  }

  console.log(`graphic.geometry`, p);

  const geometry = getGeometry()
    .addAttribute(
      'position',
      {
        // prettier-ignore
        // data: new Float32Array([
        //   -0.7, -0.7, 0.0,
        //    0.7, -0.7, 0.0,
        //    0.0,  0.7, 0.0,
        //    0.4,  0.9, 0.0,
        //    0,    0,   0,
        // ]),
        data: new Float32Array(p),
        type: GL_BUFFER_TYPE.ARRAY_BUFFER,
        usage: GL_BUFFER_USAGE.STATIC_DRAW
      },
      3
    )
    .addIndex(
      // prettier-ignore
      new Uint16Array(indices)
      // new Uint16Array([
      //   // 0, 1, 2,
      //   2, 3, 4,
      //   0, 4, 2,
      //   0, 1, 4,
      // ])
    )
    .build();

  canvas.width = 800;
  canvas.height = 800;

  const gl = canvas.getContext('webgl2')!;

  const program = getProgram(gl, vertexSrc, fragmentSrc);

  console.log(`u_offset`, program.uniformData['u_offset']);

  const { destroy } = setVertexArrayObject(gl, program.attributeData, geometry);

  gl.useProgram(program.program);

  let vec4 = v4.create();

  program.uniformData['u_offset'].set(vec4);

  program.useProgram();

  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.clearColor(0.0, 0.0, 0.0, 1);
  gl.clear(GL_CLEAR_MASK.COLOR_BUFFER_BIT);
  draw(gl, DRAW_MODES.TRIANGLES, geometry);
  // draw(gl, DRAW_MODES.LINES, geometry);

  onCleanup(() => {
    destroy();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  });

  function move(x: number = 0, y: number = 0, w: number = 0) {
    v4.set(v4.x(vec4) + x, v4.y(vec4) + y, 0, v4.w(vec4) + w, vec4);
    gl.useProgram(program.program);

    program.uniformData['u_offset'].set(vec4);

    gl.clear(GL_CLEAR_MASK.COLOR_BUFFER_BIT);
    draw(gl, DRAW_MODES.TRIANGLES, geometry);
  }

  const step = 0.1;

  const left = (<button onClick={() => move(step)}>→</button>) as HTMLButtonElement;
  const right = (<button onClick={() => move(-step)}>←</button>) as HTMLButtonElement;
  const up = (<button onClick={() => move(0, step)}>↑</button>) as HTMLButtonElement;
  const bottom = (<button onClick={() => move(0, -step)}>↓</button>) as HTMLButtonElement;

  const zoom_out = (<button onClick={() => move(0, 0, step)}>⇱</button>) as HTMLButtonElement;

  const zoom_in = (<button onClick={() => move(0, 0, -step)}>⇲</button>) as HTMLButtonElement;

  return (
    <>
      {canvas}
      <div>
        {left}
        {right}
        {up}
        {bottom}
        {zoom_out}
        {zoom_in}
      </div>
    </>
  );
}
