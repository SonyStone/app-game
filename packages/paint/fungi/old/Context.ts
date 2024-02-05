import { GL_CLEAR_MASK, GL_STATIC_VARIABLES } from '@webgl/static-variables';
import { Colour } from '../Colour';

/**
 * WebGL Context
 * @param canvas HTMLCanvasElement
 * @returns WebGL2RenderingContext
 */
export function createWebglContext(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const gl = canvas.getContext('webgl2', { alpha: false })!; //getContext( 'webgl2', { antialias: false, xrCompatible:true } ); //premultipliedAlpha: true
  if (!gl) {
    console.error('WebGL context is not available.');
  }

  return gl;
}

export function setupSomeWebglDefaults(
  gl: Pick<WebGL2RenderingContext, 'cullFace' | 'frontFace' | 'enable' | 'depthFunc' | 'blendFunc'>
) {
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  //Load Extension
  //gl.ctx.getExtension("EXT_color_buffer_float");	//Needed for Deferred Lighting
  //gl.ctx.getExtension("OES_texture_float_linear");

  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  //Setup some defaults
  gl.cullFace(GL_STATIC_VARIABLES.BACK); // Back is also default
  gl.frontFace(GL_STATIC_VARIABLES.CCW); // Dont really need to set it, its ccw by default.
  gl.enable(GL_STATIC_VARIABLES.DEPTH_TEST); // Shouldn't use this, use something else to add depth detection
  gl.enable(GL_STATIC_VARIABLES.CULL_FACE); // Cull back face, so only show triangles that are created clockwise
  gl.depthFunc(GL_STATIC_VARIABLES.LEQUAL); // Near things obscure far things
  gl.blendFunc(
    GL_STATIC_VARIABLES.SRC_ALPHA, // Setup default alpha blending
    GL_STATIC_VARIABLES.ONE_MINUS_SRC_ALPHA
  );

  /*
  gl.blendFunc( c.ONE, c.ONE ); //BLEND_ADDITIVE
  gl.blendFunc( c.SRC_ALPHA, c.ONE ); // BLEND_ALPHA_ADDITIVE
  gl.blendFunc( c.ONE, c.ZERO ); // BLEND_OVERRIDE
  gl.blendFunc( c.SRC_ALPHA, c.ONE_MINUS_SRC_ALPHA ); //BLEND_ALPHA
  */
}

/**
 * Clear Screen Buffer
 */
export function clearScreenBuffer(gl: Pick<WebGL2RenderingContext, 'clear'>) {
  gl.clear(GL_CLEAR_MASK.COLOR_BUFFER_BIT | GL_CLEAR_MASK.DEPTH_BUFFER_BIT);
}

const colour = new Colour();
export function setClearColor(gl: Pick<WebGL2RenderingContext, 'clearColor'>, hex: string) {
  const c = colour.set(hex).rgba;
  gl.clearColor(c[0], c[1], c[2], c[3]);
}

// when updating the canvas size, must reset the viewport of the canvas
// else the resolution webgl renders at will not change
export function setWebglViewport(gl: Pick<WebGL2RenderingContext, 'viewport'>, width: number, height: number) {
  // when updating the canvas size, must reset the viewport of the canvas
  // else the resolution webgl renders at will not change
  gl.viewport(0, 0, width, height);
}

export function setCanvasSize(canvas: HTMLCanvasElement, width: number, height: number) {
  // set the size of the canvas, on chrome we need to set it 3 ways to make it work perfectly.
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  canvas.width = width;
  canvas.height = height;
}
