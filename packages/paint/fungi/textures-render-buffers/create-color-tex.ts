import { COLOR_ATTACHMENT, GL_DATA_TYPE, GL_STATIC_VARIABLES } from '@packages/webgl/static-variables';
import {
  GL_PIXEL_FORMAT,
  GL_TEXTURE_MAG_FILTER,
  GL_TEXTURE_MIN_FILTER,
  GL_TEXTURE_PARAMETER_NAME,
  GL_TEXTURE_TARGET,
  GL_TEXTURE_WRAP_MODE
} from '@packages/webgl/static-variables/textures';

export function createColorTex(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  attach: COLOR_ATTACHMENT,
  pixel = 'byte'
): WebGLTexture {
  const id = gl.createTexture()!;

  gl.bindTexture(GL_TEXTURE_TARGET.TEXTURE_2D, id);

  switch (pixel) {
    case 'byte':
      gl.texImage2D(
        GL_TEXTURE_TARGET.TEXTURE_2D,
        0,
        GL_PIXEL_FORMAT.RGBA,
        width,
        height,
        0,
        GL_PIXEL_FORMAT.RGBA,
        GL_DATA_TYPE.UNSIGNED_BYTE,
        null
      );
      break;
    case 'f16':
      gl.texImage2D(
        GL_TEXTURE_TARGET.TEXTURE_2D,
        0,
        GL_STATIC_VARIABLES.RGBA16F,
        width,
        height,
        0,
        GL_PIXEL_FORMAT.RGBA,
        GL_DATA_TYPE.FLOAT,
        null
      );
      break;
    case 'f32':
      gl.texImage2D(
        GL_TEXTURE_TARGET.TEXTURE_2D,
        0,
        GL_STATIC_VARIABLES.RGBA32F,
        width,
        height,
        0,
        GL_PIXEL_FORMAT.RGBA,
        GL_DATA_TYPE.FLOAT,
        null
      );
      console.log('ep');
      break;
  }

  //
  //ctx.texParameteri( ctx.TEXTURE_2D, ctx.TEXTURE_MAG_FILTER, ctx.LINEAR ); //NEAREST
  //ctx.texParameteri( ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, ctx.LINEAR ); //NEAREST

  //ctx.texImage2D( ctx.TEXTURE_2D, 0, ctx.RGBA16F, w, h, 0, ctx.RGBA, ctx.FLOAT, null );

  // texture state
  // * TEXTURE_MIN_FILTER
  // * TEXTURE_MAG_FILTER
  // * TEXTURE_WRAP_S
  // * TEXTURE_WRAP_T
  // * TEXTURE_WRAP_R
  gl.texParameteri(
    GL_TEXTURE_TARGET.TEXTURE_2D,
    GL_TEXTURE_PARAMETER_NAME.TEXTURE_MIN_FILTER,
    GL_TEXTURE_MIN_FILTER.NEAREST
  );
  gl.texParameteri(
    GL_TEXTURE_TARGET.TEXTURE_2D,
    GL_TEXTURE_PARAMETER_NAME.TEXTURE_MAG_FILTER,
    GL_TEXTURE_MAG_FILTER.NEAREST
  );
  gl.texParameteri(
    GL_TEXTURE_TARGET.TEXTURE_2D,
    GL_TEXTURE_PARAMETER_NAME.TEXTURE_WRAP_S,
    GL_TEXTURE_WRAP_MODE.CLAMP_TO_EDGE
  );
  gl.texParameteri(
    GL_TEXTURE_TARGET.TEXTURE_2D,
    GL_TEXTURE_PARAMETER_NAME.TEXTURE_WRAP_T,
    GL_TEXTURE_WRAP_MODE.CLAMP_TO_EDGE
  );

  //ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA16F, w, h, 0, ctx.RGBA, ctx.FLOAT, null);
  //ctx.texImage2D( ctx.TEXTURE_2D, 0, ctx.RGBA32F, w, h, 0, ctx.RGBA, ctx.FLOAT, null );
  //ctx.texParameteri( ctx.TEXTURE_2D, ctx.TEXTURE_MAG_FILTER, ctx.NEAREST);
  //ctx.texParameteri( ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, ctx.NEAREST);
  //ctx.texParameteri( ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_S, ctx.CLAMP_TO_EDGE);
  //ctx.texParameteri( ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_T, ctx.CLAMP_TO_EDGE);

  //ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, ctx.LINEAR);
  //ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MAG_FILTER, ctx.LINEAR);
  //ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_S, ctx.CLAMP_TO_EDGE);	//Stretch image to X position
  //ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_T, ctx.CLAMP_TO_EDGE);	//Stretch image to Y position

  gl.framebufferTexture2D(GL_STATIC_VARIABLES.FRAMEBUFFER, attach, GL_TEXTURE_TARGET.TEXTURE_2D, id, 0);

  return id;
}
