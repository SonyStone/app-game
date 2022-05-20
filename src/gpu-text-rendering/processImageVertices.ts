import { UnpackedBMP } from "./unpackBmp";

export function processImageVertices(
  gl: WebGLRenderingContext,
  data: UnpackedBMP,
) {
  const buf = data.buf;
  const imageBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, imageBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, buf, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  console.log("Loaded image vertex buffer: " + buf.byteLength + " bytes, this is " + buf.byteLength / 10 / 6 + " images.");

  return imageBuffer;
}