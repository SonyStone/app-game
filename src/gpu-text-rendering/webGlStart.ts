import { createProgram } from './createProgram';
import { drawScene } from './drawScene';
import { processAtlas } from './processAtlas';
import { processAtlasVertices } from './processAtlasVertices';
import { processGlyphs } from './processGlyphs';
import { processImageVertices } from './processImageVertices';
import { processPageData } from './processPageData';
import { requestFile } from './requestFile';
import { unpackBmp } from './unpackBmp';

import imagevs from './imagevs.vert';
import imagefs from './imagefs.frag';
import glyphvs from './glyphvs.vert';
import glyphfs from './glyphfs.frag';
import pagevs from './pagevs.vert';
import pagefs from './pagefs.frag';

export async function webGlStart() {

  const canvas = document.getElementById("beziercanvas") as HTMLCanvasElement;

  console.log(`canvas`, canvas);

  // canvas.addEventListener("touchmove", canvasTouchMove);
  // canvas.addEventListener("touchstart", canvasTouchStart);
  // canvas.addEventListener("mousemove", canvasMouseMove);
  // canvas.addEventListener("mouseenter", canvasMouseEnter);
  // canvas.addEventListener("wheel", canvasMouseWheel);

  canvas.addEventListener("contextmenu", function(e) { e.preventDefault() }, false);
  canvas.addEventListener("mousedown", function(e) {
    if (e.button == 2 || e.buttons == 2) {
      canvas.requestPointerLock = canvas.requestPointerLock || (canvas as any).mozRequestPointerLock ||
        (canvas as any).webkitRequestPointerLock;

      canvas.requestPointerLock();
    }
  });
  canvas.addEventListener("mouseup", function(e) {
    document.exitPointerLock = document.exitPointerLock ||
      (document as any).mozExitPointerLock ||
      (document as any).webkitExitPointerLock;
    document.exitPointerLock();
  });

  // window.addEventListener("resize", forceAnimationChange);

  const { gl, glext, timerQuery } = initGl(canvas)!;

  // Shader programs
  console.log("Compiling shaders...");

  const imageProgram = createProgram(gl, imagevs, imagefs)!;
  const glyphProgram = createProgram(gl, glyphvs, glyphfs, "#define kUseRasteredAtlas\n")!;
  const glyphProgramNoRast = createProgram(gl, glyphvs, glyphfs)!;
  const pageProgram = createProgram(gl, pagevs, pagefs)!;

  console.log("Loading files...");

  const [
    glyphBuffer,
    { preAtlasTexture, atlasTexture },
    { pageData, pageBuffer },
    imageBuffer,
  ] = await Promise.all([
    requestFile("glyphs.bmp")
      .then((response) => response.arrayBuffer())
      .then((buf) => unpackBmp(buf))
      .then((bmp) => processGlyphs(gl, bmp)!),

    requestFile("atlas.bmp")
        .then((response) => response.arrayBuffer())
        .then((buf) => unpackBmp(buf))
        .then((bmp) => processAtlas(gl, bmp))
        .then(async (atlasTexture) => {
          const preAtlasTexture = await requestFile('atlasverts.bmp')
            .then((response) => response.arrayBuffer())
            .then((buf) => unpackBmp(buf))
            .then((bmp) => processAtlasVertices(gl, bmp, glyphProgramNoRast, atlasTexture));
          
          return { preAtlasTexture, atlasTexture }
        }),

    requestFile('pages.json')
      .then((response) => response.json())
      .then((json) => processPageData(gl, canvas, json)!),

    requestFile('imageverts.bmp')
      .then((response) => response.arrayBuffer())
      .then((buf) => unpackBmp(buf))
      .then((bmp) => processImageVertices(gl, bmp)!)
  ])

  let waitingForTimer = false
  let lastFrametime = 0;

  const tick = (timestamp: number) =>{
    requestAnimationFrame(tick);
    drawScene(
      glyphProgram,
      glyphBuffer,
      pageData,
      atlasTexture,
      preAtlasTexture,
      canvas,
      gl,
      waitingForTimer,
      lastFrametime,
      pageProgram,
      glext,
      pageBuffer,
      imageBuffer,
      imageProgram,
      glyphProgramNoRast,
      timestamp,
      timerQuery,
    );
  }

  tick(0);
}

function initGl(canvas: HTMLCanvasElement): {
  gl: WebGLRenderingContext;
  glext: any,
  timerQuery: WebGLQuery | undefined;
} | undefined {
  // need alpha: false so what's behind the webgl canvas doesn't bleed through
  // see http://www.zovirl.com/2012/08/24/webgl_alpha/
  var flags = {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
  }
  let gl = canvas.getContext("webgl", flags) as WebGLRenderingContext;
  if (gl == null) {
    gl = canvas.getContext("experimental-webgl", flags) as WebGLRenderingContext;
    if (gl == null) {
      console.log("Failed to create WebGL context");
      return;
    }
  }

  if (gl.getExtension('OES_standard_derivatives') == null) {
    console.log("Failed to enable required WebGL extension OES_standard_derivatives");
    return;
  }

  const glext = gl.getExtension('EXT_disjoint_timer_query');
  let timerQuery: WebGLQuery | undefined;
  if (glext) {
    timerQuery = glext.createQueryEXT() as WebGLQuery;
    document.getElementById("frametime")!.style.display = "inline";
  }

  gl.disable(gl.DEPTH_TEST);

  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  gl.viewport(0, 0, canvas.width, canvas.height);

  return { gl, glext, timerQuery };
}