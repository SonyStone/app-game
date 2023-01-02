import {
  COLOR_ATTACHMENT,
  GL_DATA_TYPE,
  GL_STATIC_VARIABLES,
  GL_TEXTURES,
} from "@webgl/static-variables";

export function create_color_tex(
  ctx: WebGL2RenderingContext,
  w: number,
  h: number,
  attach: COLOR_ATTACHMENT,
  pixel = "byte"
): WebGLTexture {
  const id = ctx.createTexture()!;

  ctx.bindTexture(GL_TEXTURES.TEXTURE_2D, id);

  switch (pixel) {
    case "byte":
      ctx.texImage2D(
        GL_TEXTURES.TEXTURE_2D,
        0,
        GL_STATIC_VARIABLES.RGBA,
        w,
        h,
        0,
        GL_STATIC_VARIABLES.RGBA,
        GL_STATIC_VARIABLES.UNSIGNED_BYTE,
        null
      );
      break;
    case "f16":
      ctx.texImage2D(
        GL_TEXTURES.TEXTURE_2D,
        0,
        GL_STATIC_VARIABLES.RGBA16F,
        w,
        h,
        0,
        GL_STATIC_VARIABLES.RGBA,
        GL_DATA_TYPE.FLOAT,
        null
      );
      break;
    case "f32":
      ctx.texImage2D(
        GL_TEXTURES.TEXTURE_2D,
        0,
        GL_STATIC_VARIABLES.RGBA32F,
        w,
        h,
        0,
        GL_STATIC_VARIABLES.RGBA,
        GL_DATA_TYPE.FLOAT,
        null
      );
      console.log("ep");
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
  ctx.texParameteri(
    GL_TEXTURES.TEXTURE_2D,
    GL_TEXTURES.TEXTURE_MIN_FILTER,
    GL_TEXTURES.NEAREST
  );
  ctx.texParameteri(
    GL_TEXTURES.TEXTURE_2D,
    GL_TEXTURES.TEXTURE_MAG_FILTER,
    GL_TEXTURES.NEAREST
  );
  ctx.texParameteri(
    GL_TEXTURES.TEXTURE_2D,
    GL_TEXTURES.TEXTURE_WRAP_S,
    GL_TEXTURES.CLAMP_TO_EDGE
  );
  ctx.texParameteri(
    GL_TEXTURES.TEXTURE_2D,
    GL_TEXTURES.TEXTURE_WRAP_T,
    GL_TEXTURES.CLAMP_TO_EDGE
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

  ctx.framebufferTexture2D(
    GL_STATIC_VARIABLES.FRAMEBUFFER,
    attach,
    GL_TEXTURES.TEXTURE_2D,
    id,
    0
  );

  return id;
}
