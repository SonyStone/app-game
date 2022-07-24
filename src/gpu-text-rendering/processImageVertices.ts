import { GL_BUFFER_TYPE, GL_STATIC_VARIABLES } from '@webgl/static-variables';

import { UnpackedBMP } from './unpackBmp';

export function processImageVertices(
  gl: WebGLRenderingContext,
  data: UnpackedBMP
) {
  const buf = data.buf;
  const imageBuffer = gl.createBuffer();
  gl.bindBuffer(GL_BUFFER_TYPE.ARRAY_BUFFER, imageBuffer);
  gl.bufferData(
    GL_BUFFER_TYPE.ARRAY_BUFFER,
    buf,
    GL_STATIC_VARIABLES.STATIC_DRAW
  );
  gl.bindBuffer(GL_BUFFER_TYPE.ARRAY_BUFFER, null);
  console.log(
    'Loaded image vertex buffer: ' +
      buf.byteLength +
      ' bytes, this is ' +
      buf.byteLength / 10 / 6 +
      ' images.'
  );

  return imageBuffer;
}
