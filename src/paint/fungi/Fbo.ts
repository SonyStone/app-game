import {
  GL_CLEAR_MASK,
  GL_DATA_TYPE,
  GL_STATIC_VARIABLES,
  GL_TEXTURES,
} from '@webgl/static-variables';

import { Context } from './Context';

export class Fbo {
  buffers: { [key: string]: any } = {};
  constructor(
    readonly id: any,
    readonly width: number,
    readonly height: number
  ) {}
}

export class FboFactory {
  constructor(readonly gl: Context) {
    gl.ctx.getExtension('EXT_color_buffer_float'); // Need it to use Float Frame Buffers
  }

  new(config: any): Fbo {
    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Create Frame Buffer Object
    let ctx = this.gl.ctx;
    let fbo = new Fbo(ctx.createFramebuffer(), config.width, config.height);

    ctx.bindFramebuffer(GL_STATIC_VARIABLES.FRAMEBUFFER, fbo.id);

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Create Textures / Render Buffers
    let i;
    for (i of config.buffers) {
      switch (i.type) {
        case 'color':
          this.create_color(fbo, i);
          break;
        case 'depth':
          this.create_depth(fbo, i);
          break;
      }
    }

    // Need to get a list of Attachment Points for the Buffers in the FBO
    let b: any;
    let attach_ary = [];
    for (i in fbo.buffers) {
      if (i == 'depth') continue;

      b = fbo.buffers[i];
      if (b.attach == undefined)
        console.error('FBO Color Buffer with no attach number', b);

      attach_ary.push(b.attach);
    }

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    //Assign which buffers are going to be written too
    ctx.drawBuffers(attach_ary);

    //Check if the Frame has been setup Correctly.
    switch (ctx.checkFramebufferStatus(ctx.FRAMEBUFFER)) {
      case GL_STATIC_VARIABLES.FRAMEBUFFER_COMPLETE:
        break;
      case GL_STATIC_VARIABLES.FRAMEBUFFER_INCOMPLETE_ATTACHMENT:
        console.log(
          'FRAMEBUFFER_INCOMPLETE_ATTACHMENT: The attachment types are mismatched or not all framebuffer attachment points are framebuffer attachment complete.'
        );
        break;
      case GL_STATIC_VARIABLES.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT:
        console.log('FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT');
        break;
      case GL_STATIC_VARIABLES.FRAMEBUFFER_INCOMPLETE_DIMENSIONS:
        console.log('FRAMEBUFFER_INCOMPLETE_DIMENSIONS');
        break;
      case GL_STATIC_VARIABLES.FRAMEBUFFER_UNSUPPORTED:
        console.log('FRAMEBUFFER_UNSUPPORTED');
        break;
      case GL_STATIC_VARIABLES.FRAMEBUFFER_INCOMPLETE_MULTISAMPLE:
        console.log('FRAMEBUFFER_INCOMPLETE_MULTISAMPLE');
        break;
      case GL_STATIC_VARIABLES.RENDERBUFFER_SAMPLES:
        console.log('RENDERBUFFER_SAMPLES');
        break;
    }

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Cleanup
    ctx.bindFramebuffer(GL_STATIC_VARIABLES.FRAMEBUFFER, null);
    ctx.bindRenderbuffer(GL_STATIC_VARIABLES.RENDERBUFFER, null);
    ctx.bindTexture(GL_TEXTURES.TEXTURE_2D, null);
    return fbo;
  }

  // #region MISC
  bind(o: any) {
    this.gl.ctx.bindFramebuffer(GL_STATIC_VARIABLES.FRAMEBUFFER, o.id);
    return this;
  }
  unbind() {
    this.gl.ctx.bindFramebuffer(GL_STATIC_VARIABLES.FRAMEBUFFER, null);
    return this;
  }
  clear() {
    let ctx = this.gl.ctx;
    //ctx.bindFramebuffer( ctx.FRAMEBUFFER, fbo.id );
    ctx.clear(GL_CLEAR_MASK.COLOR_BUFFER_BIT | GL_CLEAR_MASK.DEPTH_BUFFER_BIT);
    return this;
  }

  blit(fboRead: any, fboWrite: any) {
    let ctx = this.gl.ctx;

    //bind the two Frame Buffers
    ctx.bindFramebuffer(GL_STATIC_VARIABLES.READ_FRAMEBUFFER, fboRead.id);
    ctx.bindFramebuffer(GL_STATIC_VARIABLES.DRAW_FRAMEBUFFER, fboWrite.id);

    //Clear Frame buffer being copied to.
    ctx.clearBufferfv(GL_STATIC_VARIABLES.COLOR, 0, [0.0, 0.0, 0.0, 1.0]);

    //Transfer Pixels from one FrameBuffer to the Next
    ctx.blitFramebuffer(
      0,
      0,
      fboRead.width,
      fboRead.height,
      0,
      0,
      fboWrite.width,
      fboWrite.height,
      GL_CLEAR_MASK.COLOR_BUFFER_BIT | GL_CLEAR_MASK.DEPTH_BUFFER_BIT,
      GL_TEXTURES.NEAREST
    );

    //Unbind
    ctx.bindFramebuffer(GL_STATIC_VARIABLES.READ_FRAMEBUFFER, null);
    ctx.bindFramebuffer(GL_STATIC_VARIABLES.DRAW_FRAMEBUFFER, null);

    return this;
  }
  // #endregion //////////////////////////////////////////////////////////////////////////////////////

  // #region COLOR
  create_color(fbo: Fbo, ci: any) {
    let buf;

    switch (ci.mode) {
      case 'multi':
        buf = this.mk_color_multisample(fbo.width, fbo.height, ci.attach);
        break;
      case 'tex':
        buf = this.mk_color_tex(fbo.width, fbo.height, ci.attach, ci.pixel);
        break;
    }

    if (buf) fbo.buffers[ci.name] = buf;
  }

  mk_color_multisample(w: number, h: number, cAttachNum: any, sample_size = 4) {
    //NOTE, Only sampleSize of 4 works, any other value crashes.
    let ctx = this.gl.ctx;
    let buf = {
      id: ctx.createRenderbuffer(),
      attach: GL_STATIC_VARIABLES.COLOR_ATTACHMENT0 + cAttachNum,
      type: 'multi',
    };

    ctx.bindRenderbuffer(GL_STATIC_VARIABLES.RENDERBUFFER, buf.id); // Bind Buffer
    ctx.renderbufferStorageMultisample(
      GL_STATIC_VARIABLES.RENDERBUFFER,
      sample_size,
      GL_STATIC_VARIABLES.RGBA8,
      w,
      h
    ); // Set Data Size
    ctx.framebufferRenderbuffer(
      GL_STATIC_VARIABLES.FRAMEBUFFER,
      buf.attach,
      GL_STATIC_VARIABLES.RENDERBUFFER,
      buf.id
    ); // Bind buf to color attachment

    return buf;
  }

  mk_color_tex(w: number, h: number, cAttachNum: any, pixel = 'byte') {
    //Up to 16 texture attachments 0 to 15
    let ctx = this.gl.ctx;
    let buf = {
      id: ctx.createTexture(),
      attach: GL_STATIC_VARIABLES.COLOR_ATTACHMENT0 + cAttachNum,
      type: 'tex',
    };

    ctx.bindTexture(GL_TEXTURES.TEXTURE_2D, buf.id);

    switch (pixel) {
      case 'byte':
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
      case 'f16':
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
      case 'f32':
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
        console.log('ep');
        break;
    }

    //
    //ctx.texParameteri( ctx.TEXTURE_2D, ctx.TEXTURE_MAG_FILTER, ctx.LINEAR ); //NEAREST
    //ctx.texParameteri( ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, ctx.LINEAR ); //NEAREST

    //ctx.texImage2D( ctx.TEXTURE_2D, 0, ctx.RGBA16F, w, h, 0, ctx.RGBA, ctx.FLOAT, null );
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
      buf.attach,
      GL_TEXTURES.TEXTURE_2D,
      buf.id,
      0
    );

    return buf;
  }
  // #endregion //////////////////////////////////////////////////////////////////////////////////////

  // #region DEPTH
  create_depth(fbo: any, ci: any) {
    let buf;

    switch (ci.mode) {
      case 'multi':
        buf = this.mk_depth_multisample(fbo.width, fbo.height);
        break;
      case 'tex':
        buf = this.mk_depth_tex(fbo.width, fbo.height);
        break;
      case 'render':
        buf = this.mk_depth_render(fbo.width, fbo.height);
        break;
    }

    if (buf) fbo.buffers['depth'] = buf;
  }

  // Create a basic render buffer
  mk_depth_render(w: number, h: number) {
    let ctx = this.gl.ctx;
    let buf = { id: ctx.createRenderbuffer(), type: 'render' };

    ctx.bindRenderbuffer(GL_STATIC_VARIABLES.RENDERBUFFER, buf.id);
    ctx.renderbufferStorage(
      GL_STATIC_VARIABLES.RENDERBUFFER,
      GL_STATIC_VARIABLES.DEPTH_COMPONENT16,
      w,
      h
    );
    ctx.framebufferRenderbuffer(
      GL_STATIC_VARIABLES.FRAMEBUFFER,
      GL_STATIC_VARIABLES.DEPTH_ATTACHMENT,
      GL_STATIC_VARIABLES.RENDERBUFFER,
      buf.id
    ); //Attach buffer to frame

    return buf;
  }

  // Create a MutiSampled Render Buffer
  mk_depth_multisample(w: number, h: number) {
    let ctx = this.gl.ctx;
    let buf = { id: ctx.createRenderbuffer(), type: 'multi' };

    ctx.bindRenderbuffer(GL_STATIC_VARIABLES.RENDERBUFFER, buf.id);
    ctx.renderbufferStorageMultisample(
      GL_STATIC_VARIABLES.RENDERBUFFER,
      4,
      GL_STATIC_VARIABLES.DEPTH_COMPONENT16,
      w,
      h
    ); //DEPTH_COMPONENT24
    ctx.framebufferRenderbuffer(
      GL_STATIC_VARIABLES.FRAMEBUFFER,
      GL_STATIC_VARIABLES.DEPTH_ATTACHMENT,
      GL_STATIC_VARIABLES.RENDERBUFFER,
      buf.id
    ); //Attach buffer to frame

    return buf;
  }

  // Create a Depth Texture Buffer
  mk_depth_tex(w: number, h: number) {
    //Up to 16 texture attachments 0 to 15
    let ctx = this.gl.ctx;
    let buf = { id: ctx.createTexture(), type: 'tex' };

    ctx.bindTexture(GL_TEXTURES.TEXTURE_2D, buf.id);
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
      buf.id,
      0
    );
    return buf;
  }
  // #endregion //////////////////////////////////////////////////////////////////////////////////////
}
