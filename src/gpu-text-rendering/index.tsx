import { GL_STATIC_VARIABLES } from '@packages/webgl/static-variables';
import { onCleanup } from 'solid-js';

import atlas from './atlas.bmp?url';
import atlasverts from './atlasverts.bmp?url';
import { createProgram } from './createProgram';
import { drawScene } from './drawScene';
import glyphfs from './glyphfs.frag?raw';
import glyphs from './glyphs.bmp?url';
import glyphvs from './glyphvs.vert?raw';
import imagefs from './imagefs.frag?raw';
import imageverts from './imageverts.bmp?url';
import imagevs from './imagevs.vert?raw';
import pagefs from './pagefs.frag?raw';
import pages from './pages.json?url';
import pagevs from './pagevs.vert?raw';
import { processAtlas } from './processAtlas';
import { processAtlasVertices } from './processAtlasVertices';
import { processGlyphs } from './processGlyphs';
import { processImageVertices } from './processImageVertices';
import { processPageData } from './processPageData';
import { requestFile } from './requestFile';
import s from './style.module.scss';
import { unpackBmp } from './unpackBmp';

export default function GpuTextRendering() {
  const canvas = (<canvas id="beziercanvas" class={s.canvas}></canvas>) as HTMLCanvasElement;

  console.log(`canvas`, canvas);

  // canvas.addEventListener("touchmove", canvasTouchMove);
  // canvas.addEventListener("touchstart", canvasTouchStart);
  // canvas.addEventListener("mousemove", canvasMouseMove);
  // canvas.addEventListener("mouseenter", canvasMouseEnter);
  // canvas.addEventListener("wheel", canvasMouseWheel);

  canvas.addEventListener(
    'contextmenu',
    function (e) {
      e.preventDefault();
    },
    false
  );
  canvas.addEventListener('mousedown', function (e) {
    if (e.button == 2 || e.buttons == 2) {
      canvas.requestPointerLock =
        canvas.requestPointerLock || canvas.mozRequestPointerLock || canvas.webkitRequestPointerLock;

      canvas.requestPointerLock();
    }
  });
  canvas.addEventListener('mouseup', function (e) {
    document.exitPointerLock =
      document.exitPointerLock ||
      (document as { mozExitPointerLock: any }).mozExitPointerLock ||
      (document as any).webkitExitPointerLock;
    document.exitPointerLock();
  });

  // window.addEventListener("resize", forceAnimationChange);

  const { gl, glext, timerQuery } = initGl(canvas)!;

  // Shader programs
  console.log('Compiling shaders...');

  const imageProgram = createProgram(gl, imagevs, imagefs)!;
  const glyphProgram = createProgram(gl, glyphvs, glyphfs, '#define kUseRasteredAtlas\n')!;
  const glyphProgramNoRast = createProgram(gl, glyphvs, glyphfs)!;
  const pageProgram = createProgram(gl, pagevs, pagefs)!;

  console.log('Loading files...');

  // console.log(`glyphs`, !!glyphs);
  let animationId: number;
  const start = async () => {
    const [glyphBuffer, { preAtlasTexture, atlasTexture }, { pageData, pageBuffer }, imageBuffer] = await Promise.all([
      requestFile(glyphs)
        .then((response) => response.arrayBuffer())
        .then((buf) => unpackBmp(buf))
        .then((bmp) => processGlyphs(gl, bmp)!),

      requestFile(atlas)
        .then((response) => response.arrayBuffer())
        .then((buf) => unpackBmp(buf))
        .then((bmp) => processAtlas(gl, bmp))
        .then(async (atlasTexture) => {
          const preAtlasTexture = await requestFile(atlasverts)
            .then((response) => response.arrayBuffer())
            .then((buf) => unpackBmp(buf))
            .then((bmp) => processAtlasVertices(gl, bmp, glyphProgramNoRast, atlasTexture));

          return { preAtlasTexture, atlasTexture };
        }),

      requestFile(pages)
        .then((response) => response.json())
        .then((json) => processPageData(gl, canvas, json)!),

      requestFile(imageverts)
        .then((response) => response.arrayBuffer())
        .then((buf) => unpackBmp(buf))
        .then((bmp) => processImageVertices(gl, bmp)!)
    ]);

    let waitingForTimer = false;
    let lastFrametime = 0;

    const tick = (timestamp: number) => {
      animationId = requestAnimationFrame(tick);
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
        timerQuery
      );
    };

    tick(0);
  };

  onCleanup(() => {
    cancelAnimationFrame(animationId);
  });

  start();

  return (
    <div>
      <div id="canvaswrap" class={s.canvaswrap}>
        {canvas}
      </div>
      <div id="toolbar" class={s.toolbar}>
        <a href="/post/war-and-peace-and-webgl/">Resolution independent GPU text rendering</a>
        <br />
        Drag to pan, right mouse (or alt) drag to zoom
        <label>
          <input type="checkbox" checked id="autopan" />
          Auto zoom
        </label>
        <label>
          <input type="checkbox" id="showgrids" />
          Grids
        </label>
        <label>
          <input type="checkbox" id="vectoronly" />
          Vector only
        </label>
        <input type="button" id="fsbutton" value="Fullscreen" />
        <input id="frametime" style="display: none" />
      </div>
      <div id="loadinginfo" class={s.loadinginfo}></div>
    </div>
  );
}

function initGl(canvas: HTMLCanvasElement):
  | {
      gl: WebGLRenderingContext;
      glext: any;
      timerQuery: WebGLQuery | undefined;
    }
  | undefined {
  // need alpha: false so what's behind the webgl canvas doesn't bleed through
  // see http://www.zovirl.com/2012/08/24/webgl_alpha/
  var flags = {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false
  };
  let gl = canvas.getContext('webgl', flags) as WebGLRenderingContext;
  if (gl == null) {
    gl = canvas.getContext('experimental-webgl', flags) as WebGLRenderingContext;
    if (gl == null) {
      console.log('Failed to create WebGL context');
      return;
    }
  }

  if (gl.getExtension('OES_standard_derivatives') == null) {
    console.log('Failed to enable required WebGL extension OES_standard_derivatives');
    return;
  }

  const glext = gl.getExtension('EXT_disjoint_timer_query');
  let timerQuery: WebGLQuery | undefined;
  if (glext) {
    timerQuery = glext.createQueryEXT() as WebGLQuery;
    // document.getElementById('frametime')!.style.display = 'inline';
  }

  gl.disable(GL_STATIC_VARIABLES.DEPTH_TEST);

  gl.blendFunc(GL_STATIC_VARIABLES.SRC_ALPHA, GL_STATIC_VARIABLES.ONE_MINUS_SRC_ALPHA);

  gl.viewport(0, 0, canvas.width, canvas.height);

  return { gl, glext, timerQuery };
}
