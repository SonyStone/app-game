import { ExtWebGLProgram } from './createProgram';
import { ExtWebGLTexture } from './processAtlas';
import { UnpackedBMP } from './unpackBmp';

const int16PerVertex = 6; // const

export function processAtlasVertices(
  gl: WebGLRenderingContext,
  data: UnpackedBMP,
  glyphProgramNoRast: ExtWebGLProgram,
  atlasTexture: ExtWebGLTexture,
) {

  var handle = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, handle);
  gl.bufferData(gl.ARRAY_BUFFER, data.buf, gl.STREAM_DRAW);

  //console.log("Atlas vert buf is " + data.buf.byteLength + " bytes, this is " + data.buf.byteLength / (6 * 2 * int16PerVertex) + " glyphs");

  // framebuffer object
  const fbo: WebGLFramebuffer & { width?: number, height?: number } = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  fbo.width = data.width;
  fbo.height = data.height;

  const preAtlasTexture: WebGLTexture & { width?: number, height?: number } = gl.createTexture()!;
  preAtlasTexture.width = data.width;
  preAtlasTexture.height = data.height;
  gl.bindTexture(gl.TEXTURE_2D, preAtlasTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fbo.width, fbo.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, preAtlasTexture, 0);
  gl.bindTexture(gl.TEXTURE_2D, null);

  var status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status != gl.FRAMEBUFFER_COMPLETE) {
    console.log("checkFrameBufferStatus(gl.FRAMEBUFFER) not complete!");
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.viewport(0, 0, fbo.width, fbo.height);

  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(glyphProgramNoRast);

  gl.enable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);
  gl.depthMask((gl as any).FALSE);

  enableAttributes(gl, glyphProgramNoRast);
  doGlyphVertexAttribPointers(gl, glyphProgramNoRast);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, atlasTexture);

  gl.uniform1i(glyphProgramNoRast.uniforms!.uAtlasSampler, 0);
  gl.uniform2f(glyphProgramNoRast.uniforms!.uTexelSize, 1 / atlasTexture.width!, 1 / atlasTexture.height!);
  gl.uniform1i(glyphProgramNoRast.uniforms!.uDebug, 0);

  // Need to map [0, 1] verts to [-1, 1] NDC, ie: aPosition * 2.0 - 1.0
  gl.uniform2f(glyphProgramNoRast.uniforms!.uPositionMul, 2, 2);
  gl.uniform2f(glyphProgramNoRast.uniforms!.uPositionAdd, -1, -1);

  gl.drawArrays(gl.TRIANGLES, 0, data.buf.byteLength / (2 * int16PerVertex));

  disableAttributes(gl, glyphProgramNoRast);

  gl.useProgram(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  gl.bindTexture(gl.TEXTURE_2D, preAtlasTexture);
  gl.hint(gl.GENERATE_MIPMAP_HINT, gl.NICEST);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.bindTexture(gl.TEXTURE_2D, null);

  gl.deleteBuffer(handle);

  return preAtlasTexture;
}

function enableAttributes(gl: WebGLRenderingContext, prog: ExtWebGLProgram) {
  for (var a in prog.attributes) {
    gl.enableVertexAttribArray(prog.attributes[a])
  }
}

function disableAttributes(gl: WebGLRenderingContext, prog: ExtWebGLProgram) {
  for (var a in prog.attributes) {
    gl.disableVertexAttribArray(prog.attributes[a]);
  }
}

function doGlyphVertexAttribPointers(gl: WebGLRenderingContext, prog: ExtWebGLProgram) {
  var stride = int16PerVertex * 2;
  gl.vertexAttribPointer(prog.attributes!.aPosition, 2, gl.SHORT, true, stride, 0);
  gl.vertexAttribPointer(prog.attributes!.aCurvesMin, 2, gl.UNSIGNED_SHORT, false, stride, 2 * 2);
  gl.vertexAttribPointer(prog.attributes!.aColor, 4, gl.UNSIGNED_BYTE, true, stride, 4 * 2);
}
