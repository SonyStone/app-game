import { GL_BUFFER_TYPE, GL_CLEAR_MASK, GL_STATIC_VARIABLES, GL_TEXTURES } from '@packages/webgl/static-variables';

import { ExtWebGLProgram } from './createProgram';
import { ExtWebGLTexture } from './processAtlas';
import { UnpackedBMP } from './unpackBmp';

const int16PerVertex = 6; // const

export function processAtlasVertices(
  gl: WebGLRenderingContext,
  data: UnpackedBMP,
  glyphProgramNoRast: ExtWebGLProgram,
  atlasTexture: ExtWebGLTexture
) {
  var handle = gl.createBuffer();
  gl.bindBuffer(GL_BUFFER_TYPE.ARRAY_BUFFER, handle);
  gl.bufferData(GL_BUFFER_TYPE.ARRAY_BUFFER, data.buf, gl.STREAM_DRAW);

  //console.log("Atlas vert buf is " + data.buf.byteLength + " bytes, this is " + data.buf.byteLength / (6 * 2 * int16PerVertex) + " glyphs");

  // framebuffer object
  const fbo: WebGLFramebuffer & { width?: number; height?: number } = gl.createFramebuffer()!;
  gl.bindFramebuffer(GL_STATIC_VARIABLES.FRAMEBUFFER, fbo);
  fbo.width = data.width;
  fbo.height = data.height;

  const preAtlasTexture: WebGLTexture & { width?: number; height?: number } = gl.createTexture()!;
  preAtlasTexture.width = data.width;
  preAtlasTexture.height = data.height;
  gl.bindTexture(GL_TEXTURES.TEXTURE_2D, preAtlasTexture);
  gl.texParameteri(GL_TEXTURES.TEXTURE_2D, GL_TEXTURES.TEXTURE_MAG_FILTER, GL_TEXTURES.LINEAR);
  gl.texParameteri(GL_TEXTURES.TEXTURE_2D, GL_TEXTURES.TEXTURE_MIN_FILTER, GL_TEXTURES.LINEAR_MIPMAP_NEAREST);
  gl.texParameteri(GL_TEXTURES.TEXTURE_2D, GL_TEXTURES.TEXTURE_WRAP_S, GL_TEXTURES.CLAMP_TO_EDGE);
  gl.texParameteri(GL_TEXTURES.TEXTURE_2D, GL_TEXTURES.TEXTURE_WRAP_T, GL_TEXTURES.CLAMP_TO_EDGE);
  gl.texImage2D(
    GL_TEXTURES.TEXTURE_2D,
    0,
    GL_STATIC_VARIABLES.RGBA,
    fbo.width,
    fbo.height,
    0,
    GL_STATIC_VARIABLES.RGBA,
    GL_STATIC_VARIABLES.UNSIGNED_BYTE,
    null
  );
  gl.generateMipmap(GL_TEXTURES.TEXTURE_2D);
  gl.framebufferTexture2D(
    GL_STATIC_VARIABLES.FRAMEBUFFER,
    GL_STATIC_VARIABLES.COLOR_ATTACHMENT0,
    GL_TEXTURES.TEXTURE_2D,
    preAtlasTexture,
    0
  );
  gl.bindTexture(GL_TEXTURES.TEXTURE_2D, null);

  var status = gl.checkFramebufferStatus(GL_STATIC_VARIABLES.FRAMEBUFFER);
  if (status != GL_STATIC_VARIABLES.FRAMEBUFFER_COMPLETE) {
    console.log('checkFrameBufferStatus(FRAMEBUFFER) not complete!');
  }

  gl.bindFramebuffer(GL_STATIC_VARIABLES.FRAMEBUFFER, fbo);
  gl.viewport(0, 0, fbo.width, fbo.height);

  gl.clearColor(0, 0, 0, 1);
  gl.clear(GL_CLEAR_MASK.COLOR_BUFFER_BIT);

  gl.useProgram(glyphProgramNoRast);

  gl.enable(GL_STATIC_VARIABLES.BLEND);
  gl.disable(GL_STATIC_VARIABLES.DEPTH_TEST);
  gl.depthMask((gl as any).FALSE);

  console.log(`GL_STATIC_VARIABLES.FALSE`, (gl as any).FALSE);

  enableAttributes(gl, glyphProgramNoRast);
  doGlyphVertexAttribPointers(gl, glyphProgramNoRast);

  gl.activeTexture(GL_TEXTURES.TEXTURE0);
  gl.bindTexture(GL_TEXTURES.TEXTURE_2D, atlasTexture);

  gl.uniform1i(glyphProgramNoRast.uniforms!.uAtlasSampler, 0);
  gl.uniform2f(glyphProgramNoRast.uniforms!.uTexelSize, 1 / atlasTexture.width!, 1 / atlasTexture.height!);
  gl.uniform1i(glyphProgramNoRast.uniforms!.uDebug, 0);

  // Need to map [0, 1] verts to [-1, 1] NDC, ie: aPosition * 2.0 - 1.0
  gl.uniform2f(glyphProgramNoRast.uniforms!.uPositionMul, 2, 2);
  gl.uniform2f(glyphProgramNoRast.uniforms!.uPositionAdd, -1, -1);

  gl.drawArrays(GL_STATIC_VARIABLES.TRIANGLES, 0, data.buf.byteLength / (2 * int16PerVertex));

  disableAttributes(gl, glyphProgramNoRast);

  gl.useProgram(null);
  gl.bindBuffer(GL_BUFFER_TYPE.ARRAY_BUFFER, null);
  gl.bindFramebuffer(GL_STATIC_VARIABLES.FRAMEBUFFER, null);

  gl.bindTexture(GL_TEXTURES.TEXTURE_2D, preAtlasTexture);
  gl.hint(GL_STATIC_VARIABLES.GENERATE_MIPMAP_HINT, GL_STATIC_VARIABLES.NICEST);
  gl.generateMipmap(GL_TEXTURES.TEXTURE_2D);
  gl.bindTexture(GL_TEXTURES.TEXTURE_2D, null);

  gl.deleteBuffer(handle);

  return preAtlasTexture;
}

function enableAttributes(gl: WebGLRenderingContext, prog: ExtWebGLProgram) {
  for (var a in prog.attributes) {
    gl.enableVertexAttribArray(prog.attributes[a]);
  }
}

function disableAttributes(gl: WebGLRenderingContext, prog: ExtWebGLProgram) {
  for (var a in prog.attributes) {
    gl.disableVertexAttribArray(prog.attributes[a]);
  }
}

function doGlyphVertexAttribPointers(gl: WebGLRenderingContext, prog: ExtWebGLProgram) {
  var stride = int16PerVertex * 2;
  gl.vertexAttribPointer(prog.attributes!.aPosition, 2, GL_STATIC_VARIABLES.SHORT, true, stride, 0);
  gl.vertexAttribPointer(prog.attributes!.aCurvesMin, 2, GL_STATIC_VARIABLES.UNSIGNED_SHORT, false, stride, 2 * 2);
  gl.vertexAttribPointer(prog.attributes!.aColor, 4, GL_STATIC_VARIABLES.UNSIGNED_BYTE, true, stride, 4 * 2);
}
