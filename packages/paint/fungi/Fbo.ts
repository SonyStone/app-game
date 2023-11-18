import {
  GL_CLEAR_MASK,
  GL_STATIC_VARIABLES,
  GL_TEXTURES,
} from "@webgl/static-variables";

import { create_color_multisample } from "./textures-render-buffers/create_color_multisample";
import { create_color_tex } from "./textures-render-buffers/create_color_tex";
import { create_depth_multisample } from "./textures-render-buffers/create_depth_multisample";
import { create_depth_render } from "./textures-render-buffers/create_depth_render";
import { create_depth_tex } from "./textures-render-buffers/create_depth_tex";
import {
  ColorAttachmentNumber,
  get_color_attachment_number,
} from "./textures-render-buffers/get_color_attachment_number";

/**
 * mk_color_multisample
 * mk_color_tex
 */
interface TextureBuffer {
  name: string;
  type: "color";
  mode: "multi" | "tex";
  attach: ColorAttachmentNumber;
  pixel: "byte" | "f16" | "f32";
}

/**
 * mk_depth_render -- a basic render buffer
 * mk_depth_multisample -- a MutiSampled Render Buffer
 * mk_depth_tex -- a Depth Texture Buffer
 */
interface RenderBuffer {
  type: "depth";
  mode: "multi" | "tex" | "render";
}

export interface IFramebufferObject {
  buffers: {
    [key: string]: {
      type: "color" | "depth";
      mode: "multi" | "tex";
    };
  };
  id: WebGLFramebuffer;
  width: number;
  height: number;
}

export class FramebufferMap {
  buffers: { [key: string]: any } = {};
  constructor(
    readonly gl: Pick<
      WebGL2RenderingContext,
      | "createRenderbuffer"
      | "bindRenderbuffer"
      | "renderbufferStorage"
      | "renderbufferStorageMultisample"
      | "framebufferRenderbuffer"
      | "createTexture"
      | "bindTexture"
      | "texImage2D"
      | "texParameteri"
      | "framebufferTexture2D"
      | "texStorage2D"
    >,
    readonly id: WebGLFramebuffer,
    readonly width: number,
    readonly height: number
  ) {}

  create_color(ci: TextureBuffer) {
    const attach = get_color_attachment_number(ci.attach);
    switch (ci.mode) {
      case "multi": {
        const buf = {
          id: create_color_multisample(
            this.gl,
            this.width,
            this.height,
            attach
          ),
          attach,
          type: "multi",
        };
        this.buffers[ci.name] = buf;
        return buf;
      }
      case "tex": {
        const buf = {
          id: create_color_tex(
            this.gl,
            this.width,
            this.height,
            attach,
            ci.pixel
          ),
          attach,
          type: "tex",
        };
        this.buffers[ci.name] = buf;
        return buf;
      }
      default: {
        throw new Error("Not supported TextureBuffer mode");
      }
    }
  }

  create_depth(ci: RenderBuffer) {
    switch (ci.mode) {
      case "multi": {
        const buf = {
          id: create_depth_multisample(this.gl, this.width, this.height),
          type: "multi",
        };
        this.buffers["depth"] = buf;
        return buf;
      }
      case "tex": {
        const buf = {
          id: create_depth_tex(this.gl, this.width, this.height),
          type: "tex",
        };
        this.buffers["depth"] = buf;
        return buf;
      }
      case "render": {
        const buf = {
          id: create_depth_render(this.gl, this.width, this.height),
          type: "render",
        };
        this.buffers["depth"] = buf;
        return buf;
      }
      default: {
        throw new Error("Not supported RenderBuffer mode");
      }
    }
  }
}

/** Check if the Frame has been setup Correctly. */
function checkFramebufferStatus(
  gl: Pick<WebGL2RenderingContext, "checkFramebufferStatus">
) {
  switch (gl.checkFramebufferStatus(GL_STATIC_VARIABLES.FRAMEBUFFER)) {
    case GL_STATIC_VARIABLES.FRAMEBUFFER_COMPLETE:
      break;
    case GL_STATIC_VARIABLES.FRAMEBUFFER_INCOMPLETE_ATTACHMENT:
      console.log(
        "FRAMEBUFFER_INCOMPLETE_ATTACHMENT: The attachment types are mismatched or not all framebuffer attachment points are framebuffer attachment complete."
      );
      break;
    case GL_STATIC_VARIABLES.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT:
      console.log("FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT");
      break;
    case GL_STATIC_VARIABLES.FRAMEBUFFER_INCOMPLETE_DIMENSIONS:
      console.log("FRAMEBUFFER_INCOMPLETE_DIMENSIONS");
      break;
    case GL_STATIC_VARIABLES.FRAMEBUFFER_UNSUPPORTED:
      console.log("FRAMEBUFFER_UNSUPPORTED");
      break;
    case GL_STATIC_VARIABLES.FRAMEBUFFER_INCOMPLETE_MULTISAMPLE:
      console.log("FRAMEBUFFER_INCOMPLETE_MULTISAMPLE");
      break;
    case GL_STATIC_VARIABLES.RENDERBUFFER_SAMPLES:
      console.log("RENDERBUFFER_SAMPLES");
      break;
  }
}

export class FramebufferObjectFactory {
  constructor(
    private readonly gl: Pick<
      WebGL2RenderingContext,
      | "createFramebuffer"
      | "getExtension"
      | "bindFramebuffer"
      | "createRenderbuffer"
      | "bindRenderbuffer"
      | "renderbufferStorage"
      | "renderbufferStorageMultisample"
      | "framebufferRenderbuffer"
      | "createTexture"
      | "bindTexture"
      | "texImage2D"
      | "texParameteri"
      | "framebufferTexture2D"
      | "texStorage2D"
      | "drawBuffers"
      | "checkFramebufferStatus"
      | "clear"
      | "clearBufferfv"
      | "blitFramebuffer"
    >
  ) {
    gl.getExtension("EXT_color_buffer_float"); // Need it to use Float Frame Buffers
  }

  new(config: any): FramebufferMap {
    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Create Frame Buffer Object
    const gl = this.gl;
    const framebufferId = gl.createFramebuffer()!;
    const width = config.width;
    const height = config.height;

    gl.bindFramebuffer(GL_STATIC_VARIABLES.FRAMEBUFFER, framebufferId);

    const fbo = new FramebufferMap(gl, framebufferId, width, height);

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Create Textures / Render Buffers

    // Need to get a list of Attachment Points for the Buffers in the FBO
    const attach_ary = [];

    for (const i of config.buffers) {
      switch (i.type) {
        case "color":
          const buf = fbo.create_color(i);
          attach_ary.push(buf.attach);
          break;
        case "depth":
          fbo.create_depth(i);
          break;
      }
    }

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    //Assign which buffers are going to be written too
    gl.drawBuffers(attach_ary);

    checkFramebufferStatus(gl);

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Cleanup
    gl.bindFramebuffer(GL_STATIC_VARIABLES.FRAMEBUFFER, null);
    gl.bindRenderbuffer(GL_STATIC_VARIABLES.RENDERBUFFER, null);
    gl.bindTexture(GL_TEXTURES.TEXTURE_2D, null);
    return fbo;
  }

  /**
   *
   * `gl.bindFramebuffer(FRAMEBUFFER, fbo_id)`
   */
  bind(o: any) {
    this.gl.bindFramebuffer(GL_STATIC_VARIABLES.FRAMEBUFFER, o.id);
    return this;
  }

  /**
   * `gl.bindFramebuffer(FRAMEBUFFER, null)`
   */
  unbind() {
    this.gl.bindFramebuffer(GL_STATIC_VARIABLES.FRAMEBUFFER, null);
    return this;
  }

  clear() {
    let gl = this.gl;
    //ctx.bindFramebuffer( ctx.FRAMEBUFFER, fbo.id );
    gl.clear(GL_CLEAR_MASK.COLOR_BUFFER_BIT | GL_CLEAR_MASK.DEPTH_BUFFER_BIT);
    return this;
  }

  blit(fboRead: any, fboWrite: any) {
    let gl = this.gl;

    //bind the two Frame Buffers
    gl.bindFramebuffer(GL_STATIC_VARIABLES.READ_FRAMEBUFFER, fboRead.id);
    gl.bindFramebuffer(GL_STATIC_VARIABLES.DRAW_FRAMEBUFFER, fboWrite.id);

    //Clear Frame buffer being copied to.
    gl.clearBufferfv(GL_STATIC_VARIABLES.COLOR, 0, [0.0, 0.0, 0.0, 1.0]);

    //Transfer Pixels from one FrameBuffer to the Next
    gl.blitFramebuffer(
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
    gl.bindFramebuffer(GL_STATIC_VARIABLES.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(GL_STATIC_VARIABLES.DRAW_FRAMEBUFFER, null);

    return this;
  }
}
