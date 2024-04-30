import { FMat4 } from '@packages/math/m4';
import { resizeCanvasToDisplaySize } from '@packages/twgl';
import { identity, ortho, rotateZ, rotationZ, setTranslation } from '@packages/twgl/m4';
import { compileShader } from '@packages/webgl/compileShader';
import { linkProgram } from '@packages/webgl/linkProgram';
import { GL_BUFFER_TYPE, GL_BUFFER_USAGE, GL_SHADER_TYPE } from '@packages/webgl/static-variables';
import { createWindowSize } from '@solid-primitives/resize-observer';
import { createEffect, onCleanup } from 'solid-js';
import fragmentSrc from './instanced-drawing.frag?raw';
import vertexSrc from './instanced-drawing.vert?raw';

export default function InstancedDrawing() {
  const canvas = (<canvas height={800} width={800} />) as HTMLCanvasElement;

  const resize = createWindowSize();
  createEffect(() => {
    canvas.width = resize.width;
    canvas.height = resize.height;
  });

  const gl = canvas.getContext('webgl2')!;

  const vertShader = compileShader(gl, GL_SHADER_TYPE.VERTEX_SHADER, vertexSrc);
  const fragShader = compileShader(gl, GL_SHADER_TYPE.FRAGMENT_SHADER, fragmentSrc);

  const program = linkProgram(gl, vertShader, fragShader)!;

  gl.deleteShader(vertShader);
  gl.deleteShader(fragShader);

  const positionLoc = gl.getAttribLocation(program, 'a_position');
  const colorLoc = gl.getAttribLocation(program, 'color');
  const matrixLoc = gl.getAttribLocation(program, 'matrix');
  const projectionLoc = gl.getUniformLocation(program, 'projection');
  const viewLoc = gl.getUniformLocation(program, 'view');

  // Create a vertex array object (attribute state)
  const vao = gl.createVertexArray();

  // and make it the one we're currently working with
  gl.bindVertexArray(vao);

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(GL_BUFFER_TYPE.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(
    GL_BUFFER_TYPE.ARRAY_BUFFER,
    // prettier-ignore
    new Float32Array([
      -0.1, 0.4, -0.1, -0.4,
      0.1, -0.4, -0.1, 0.4,
      0.1, -0.4, 0.1, 0.4,
      -0.4, -0.1, 0.4, -0.1,
      -0.4, 0.1, -0.4, 0.1,
      0.4, -0.1, 0.4, 0.1
    ]),
    GL_BUFFER_USAGE.STATIC_DRAW
  );
  const numVertices = 12;

  // setup the position attribute
  gl.enableVertexAttribArray(positionLoc);
  gl.vertexAttribPointer(
    positionLoc, // location
    2, // size (num values to pull from buffer per iteration)
    gl.FLOAT, // type of data in buffer
    false, // normalize
    0, // stride (0 = compute from size and type above)
    0 // offset in buffer
  );

  // setup matrixes, one per instance
  const numInstances = 5;
  // make a typed array with one view per matrix
  const matrixData = new Float32Array(numInstances * 16);
  const matrices: Float32Array[] = [];
  for (let i = 0; i < numInstances; ++i) {
    const byteOffsetToMatrix = i * 16 * 4;
    const numFloatsForView = 16;
    matrices.push(new Float32Array(matrixData.buffer, byteOffsetToMatrix, numFloatsForView));
  }

  const matrixBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, matrixBuffer);
  // just allocate the buffer
  gl.bufferData(gl.ARRAY_BUFFER, matrixData.byteLength, gl.DYNAMIC_DRAW);

  // set all 4 attributes for matrix
  const bytesPerMatrix = 4 * 16;
  for (let i = 0; i < 4; ++i) {
    const loc = matrixLoc + i;
    gl.enableVertexAttribArray(loc);
    // note the stride and offset
    const offset = i * 16; // 4 floats per row, 4 bytes per float
    gl.vertexAttribPointer(
      loc, // location
      4, // size (num values to pull from buffer per iteration)
      gl.FLOAT, // type of data in buffer
      false, // normalize
      bytesPerMatrix, // stride, num bytes to advance to get to next set of values
      offset // offset in buffer
    );
    // this line says this attribute only changes for each 1 instance
    gl.vertexAttribDivisor(loc, 1);
  }

  // setup colors, one per instance
  const colorBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    // prettier-ignore
    new Float32Array([ 
      1, 0, 0, 1,  // red
      0, 1, 0, 1,  // green
      0, 0, 1, 1,  // blue
      1, 0, 1, 1,  // magenta
      0, 1, 1, 1,  // cyan
    ]),
    gl.STATIC_DRAW
  );

  // set attribute for color
  gl.enableVertexAttribArray(colorLoc);
  gl.vertexAttribPointer(colorLoc, 4, gl.FLOAT, false, 0, 0);
  // this line says this attribute only changes for each 1 instance
  gl.vertexAttribDivisor(colorLoc, 1);

  function render(time: number) {
    time *= 0.001; // seconds

    // Tell WebGL how to convert from clip space to pixels
    resizeCanvasToDisplaySize(canvas);
    gl.viewport(0, 0, canvas.width, canvas.height);

    gl.useProgram(program);

    // set the view and projection matrices since
    // they are shared by all instances
    const aspect = canvas.clientWidth / canvas.clientHeight;
    gl.uniformMatrix4fv(projectionLoc, false, ortho(-aspect, aspect, -1, 1, -1, 1, new FMat4()));
    gl.uniformMatrix4fv(viewLoc, false, rotationZ(time * 0.1, new FMat4()));

    // setup all attributes
    gl.bindVertexArray(vao);

    // update all the matrices
    matrices.forEach((mat, ndx) => {
      identity(mat);
      setTranslation(mat, [-0.5 + ndx * 0.25, 0, 0], mat);
      rotateZ(mat, time * (0.1 + 0.1 * ndx), mat);
    });

    // upload the new matrix data
    gl.bindBuffer(gl.ARRAY_BUFFER, matrixBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, matrixData);

    gl.drawArraysInstanced(
      gl.TRIANGLES,
      0, // offset
      numVertices, // num vertices per instance
      numInstances // num instances
    );
    requestID = requestAnimationFrame(render);
  }
  let requestID = requestAnimationFrame(render);

  onCleanup(() => {
    cancelAnimationFrame(requestID);
  });

  return canvas;
}
