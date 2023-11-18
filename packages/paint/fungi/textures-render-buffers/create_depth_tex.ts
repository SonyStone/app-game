import { GL_STATIC_VARIABLES, GL_TEXTURES } from "@webgl/static-variables";

// Create a Depth Texture Buffer
export function create_depth_tex(
  ctx: Pick<
    WebGL2RenderingContext,
    | "createTexture"
    | "bindTexture"
    | "texParameteri"
    | "texStorage2D"
    | "framebufferTexture2D"
  >,
  w: number,
  h: number
): WebGLTexture {
  //Up to 16 texture attachments 0 to 15
  const id = ctx.createTexture()!;

  ctx.bindTexture(GL_TEXTURES.TEXTURE_2D, id);
  //ctx.pixelStorei(ctx.UNPACK_FLIP_Y_WEBGL, false);
  ctx.texParameteri(
    GL_TEXTURES.TEXTURE_2D,
    GL_TEXTURES.TEXTURE_MAG_FILTER,
    GL_TEXTURES.NEAREST
  );
  ctx.texParameteri(
    GL_TEXTURES.TEXTURE_2D,
    GL_TEXTURES.TEXTURE_MIN_FILTER,
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
  ctx.texStorage2D(
    GL_TEXTURES.TEXTURE_2D,
    1,
    GL_STATIC_VARIABLES.DEPTH_COMPONENT16,
    w,
    h
  );

  ctx.framebufferTexture2D(
    GL_STATIC_VARIABLES.FRAMEBUFFER,
    GL_STATIC_VARIABLES.DEPTH_ATTACHMENT,
    GL_TEXTURES.TEXTURE_2D,
    id,
    0
  );

  return id;
}
