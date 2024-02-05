import { GL_STATIC_VARIABLES } from '@webgl/static-variables/static-variables';

export class Texture {
  constructor(
    readonly name: any,
    readonly id: any
  ) {}
}

export class TextureFactory {
  cache = new Map();

  constructor(readonly gl: any) {}

  get(n: any) {
    return this.cache.get(n);
  }

  new(name: any, img: any, do_yflip = false, use_mips = false, wrap_mode = 0, filter_mode = 0) {
    let tex = new Texture(name, this.gl.gl.createTexture());
    this.cache.set(name, tex);
    return this.update(tex, img, do_yflip, use_mips, wrap_mode, filter_mode);
  }

  update(tex: any, img: any, do_yflip = false, use_mips = false, wrap_mode = 0, filter_mode = 0) {
    let ctx = this.gl.gl;

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Flip the texture by the Y Position, So 0,0 is bottom left corner.
    if (do_yflip) ctx.pixelStorei(GL_STATIC_VARIABLES.UNPACK_FLIP_Y_WEBGL, true);

    // Bind texture, then Push image to GPU.
    ctx.bindTexture(GL_STATIC_VARIABLES.TEXTURE_2D, tex.id);
    ctx.texImage2D(
      GL_STATIC_VARIABLES.TEXTURE_2D,
      0,
      GL_STATIC_VARIABLES.RGBA,
      GL_STATIC_VARIABLES.RGBA,
      GL_STATIC_VARIABLES.UNSIGNED_BYTE,
      img
    );

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    if (use_mips) {
      ctx.texParameteri(
        GL_STATIC_VARIABLES.TEXTURE_2D,
        GL_STATIC_VARIABLES.TEXTURE_MAG_FILTER,
        GL_STATIC_VARIABLES.LINEAR
      ); // Setup up scaling
      ctx.texParameteri(
        GL_STATIC_VARIABLES.TEXTURE_2D,
        GL_STATIC_VARIABLES.TEXTURE_MIN_FILTER,
        GL_STATIC_VARIABLES.LINEAR_MIPMAP_NEAREST
      ); // Setup down scaling
      ctx.generateMipmap(GL_STATIC_VARIABLES.TEXTURE_2D); //Precalc different sizes of texture for better quality rendering.
    } else {
      let filter = filter_mode == 0 ? GL_STATIC_VARIABLES.LINEAR : GL_STATIC_VARIABLES.NEAREST,
        wrap = wrap_mode == 0 ? ctx.REPEAT : GL_STATIC_VARIABLES.CLAMP_TO_EDGE;

      ctx.texParameteri(GL_STATIC_VARIABLES.TEXTURE_2D, GL_STATIC_VARIABLES.TEXTURE_MAG_FILTER, filter);
      ctx.texParameteri(GL_STATIC_VARIABLES.TEXTURE_2D, GL_STATIC_VARIABLES.TEXTURE_MIN_FILTER, filter);
      ctx.texParameteri(GL_STATIC_VARIABLES.TEXTURE_2D, GL_STATIC_VARIABLES.TEXTURE_WRAP_S, wrap);
      ctx.texParameteri(GL_STATIC_VARIABLES.TEXTURE_2D, GL_STATIC_VARIABLES.TEXTURE_WRAP_T, wrap);
    }

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Cleanup
    ctx.bindTexture(ctx.TEXTURE_2D, null); // Unbind
    if (do_yflip) ctx.pixelStorei(ctx.UNPACK_FLIP_Y_WEBGL, false); // Stop flipping textures

    return tex;
  }

  // imgAry must be 6 elements long and images placed in the right order
  // RIGHT +X, LEFT -X,TOP +Y, BOTTOM -Z, BACK +Z, FRONT -Z
  // pos_x.jpg, neg_x.jpg, pos_y.jpg, neg_y.jpg, pos_z.jpg, neg_z.jpg
  new_cube(name: any, img_ary: any, use_mips = false) {
    if (img_ary.length != 6) return null;
    let ctx = this.gl.gl;

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Cube Constants values increment, so easy to start with right and just add 1 in a loop
    // To make the code easier costs by making the imgAry coming into the function to have
    // the images sorted in the same way the constants are set.
    //	TEXTURE_CUBE_MAP_POSITIVE_X - Right	:: TEXTURE_CUBE_MAP_NEGATIVE_X - Left
    //	TEXTURE_CUBE_MAP_POSITIVE_Y - Top 	:: TEXTURE_CUBE_MAP_NEGATIVE_Y - Bottom
    //	TEXTURE_CUBE_MAP_POSITIVE_Z - Back	:: TEXTURE_CUBE_MAP_NEGATIVE_Z - Front

    let tex = ctx.createTexture();
    ctx.bindTexture(GL_STATIC_VARIABLES.TEXTURE_CUBE_MAP, tex);

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // push image to specific spot in the cube map.
    for (let i = 0; i < 6; i++) {
      ctx.texImage2D(
        GL_STATIC_VARIABLES.TEXTURE_CUBE_MAP_POSITIVE_X + i,
        0,
        GL_STATIC_VARIABLES.RGBA,
        GL_STATIC_VARIABLES.RGBA,
        GL_STATIC_VARIABLES.UNSIGNED_BYTE,
        img_ary[i]
      );
    }

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    ctx.texParameteri(
      GL_STATIC_VARIABLES.TEXTURE_CUBE_MAP,
      GL_STATIC_VARIABLES.TEXTURE_MAG_FILTER,
      GL_STATIC_VARIABLES.LINEAR
    ); // Setup up scaling
    ctx.texParameteri(
      GL_STATIC_VARIABLES.TEXTURE_CUBE_MAP,
      GL_STATIC_VARIABLES.TEXTURE_MIN_FILTER,
      GL_STATIC_VARIABLES.LINEAR
    ); // Setup down scaling
    ctx.texParameteri(
      GL_STATIC_VARIABLES.TEXTURE_CUBE_MAP,
      GL_STATIC_VARIABLES.TEXTURE_WRAP_S,
      GL_STATIC_VARIABLES.CLAMP_TO_EDGE
    ); // Stretch image to X position
    ctx.texParameteri(
      GL_STATIC_VARIABLES.TEXTURE_CUBE_MAP,
      GL_STATIC_VARIABLES.TEXTURE_WRAP_T,
      GL_STATIC_VARIABLES.CLAMP_TO_EDGE
    ); // Stretch image to Y position
    ctx.texParameteri(
      GL_STATIC_VARIABLES.TEXTURE_CUBE_MAP,
      GL_STATIC_VARIABLES.TEXTURE_WRAP_R,
      GL_STATIC_VARIABLES.CLAMP_TO_EDGE
    ); // Stretch image to Z position
    if (use_mips) ctx.generateMipmap(GL_STATIC_VARIABLES.TEXTURE_CUBE_MAP);

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    ctx.bindTexture(GL_STATIC_VARIABLES.TEXTURE_CUBE_MAP, null);
    this.cache.set(name, tex);

    return tex;
  }
}
