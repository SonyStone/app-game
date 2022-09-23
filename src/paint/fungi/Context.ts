import { GL_CLEAR_MASK, GL_STATIC_VARIABLES } from '@webgl/static-variables';
import { Colour } from './Colour';

export class Context {
  // #region MAIN
  ctx: WebGL2RenderingContext;
  width = 0;
  height = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // WebGL Context
    this.ctx = canvas.getContext('webgl2', { alpha: false })!; //getContext( 'webgl2', { antialias: false, xrCompatible:true } ); //premultipliedAlpha: true
    if (!this.ctx) {
      console.error('WebGL context is not available.');
    }

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    //Load Extension
    //gl.ctx.getExtension("EXT_color_buffer_float");	//Needed for Deferred Lighting
    //gl.ctx.getExtension("OES_texture_float_linear");

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    //Setup some defaults
    let ctx = this.ctx;
    ctx.cullFace(GL_STATIC_VARIABLES.BACK); // Back is also default
    ctx.frontFace(GL_STATIC_VARIABLES.CCW); // Dont really need to set it, its ccw by default.
    ctx.enable(GL_STATIC_VARIABLES.DEPTH_TEST); // Shouldn't use this, use something else to add depth detection
    ctx.enable(GL_STATIC_VARIABLES.CULL_FACE); // Cull back face, so only show triangles that are created clockwise
    ctx.depthFunc(GL_STATIC_VARIABLES.LEQUAL); // Near things obscure far things
    ctx.blendFunc(
      GL_STATIC_VARIABLES.SRC_ALPHA, // Setup default alpha blending
      GL_STATIC_VARIABLES.ONE_MINUS_SRC_ALPHA
    );

    /*
		c.blendFunc( c.ONE, c.ONE ); //BLEND_ADDITIVE
		c.blendFunc( c.SRC_ALPHA, c.ONE ); // BLEND_ALPHA_ADDITIVE
		c.blendFunc( c.ONE, c.ZERO ); // BLEND_OVERRIDE
		c.blendFunc( c.SRC_ALPHA, c.ONE_MINUS_SRC_ALPHA ); //BLEND_ALPHA
		*/
  }

  clear() {
    this.ctx.clear(
      GL_CLEAR_MASK.COLOR_BUFFER_BIT | GL_CLEAR_MASK.DEPTH_BUFFER_BIT
    );
    return this;
  }

  set_size(w = 500, h = 500) {
    // set the size of the canvas, on chrome we need to set it 3 ways to make it work perfectly.
    this.ctx.canvas.style.width = w + 'px';
    this.ctx.canvas.style.height = h + 'px';
    this.ctx.canvas.width = w;
    this.ctx.canvas.height = h;

    // when updating the canvas size, must reset the viewport of the canvas
    // else the resolution webgl renders at will not change
    this.ctx.viewport(0, 0, w, h);
    this.width = w; // Need to save Width and Height to resize viewport back if we need to.
    this.height = h;
    return this;
  }

  set_color(hex: string) {
    let c = new Colour(hex).rgba;
    this.ctx.clearColor(c[0], c[1], c[2], c[3]);
    return this;
  }
}
