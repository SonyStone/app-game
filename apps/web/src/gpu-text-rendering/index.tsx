import { GL_STATIC_VARIABLES } from '@app-game/webgl/static-variables';
import { makeEventListener } from '@solid-primitives/event-listener';
import { makeResizeObserver } from '@solid-primitives/resize-observer';
import { onCleanup } from 'solid-js';
import { makeCameraControls } from './makeCameraControls';
import { forceAnimationChange } from './renderNextFrame';

import atlas from './atlas.bmp?url';
import atlasverts from './atlasverts.bmp?url';
import { createProgram } from './createProgram';
import { createSceneRenderer } from './drawScene';
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

/** Displays the document with mouse, pen and multitouch camera controls. */
export default function GpuTextRendering() {
  const canvas = (<canvas id="beziercanvas" class={s.canvas}></canvas>) as HTMLCanvasElement;
  const renderer = createSceneRenderer();
  let pageAspect = 612 / 792;
  let disposed = false;
  const autoPan = (<input type="checkbox" id="autopan" />) as HTMLInputElement;
  makeCameraControls(
    canvas,
    renderer.camera,
    () => pageAspect,
    (phase) => {
      if (phase === 'start') renderer.stopAnimation();
      autoPan.checked = false;
      renderer.syncCamera();
    }
  );
  makeEventListener(window, 'resize', forceAnimationChange);
  makeResizeObserver(forceAnimationChange).observe(canvas);

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
    const [{ glyphBuffer, positions }, { preAtlasTexture, atlasTexture }, { pageData, pageBuffer }, imageBuffer] =
      await Promise.all([
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

    if (disposed) return;
    renderer.setPositions(positions);
    pageAspect = pageData[0].width / pageData[0].height;

    const tick = (timestamp: number) => {
      animationId = requestAnimationFrame(tick);
      renderer.drawScene(
        glyphProgram,
        glyphBuffer!,
        pageData,
        atlasTexture,
        preAtlasTexture,
        canvas,
        gl,
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
    disposed = true;
    cancelAnimationFrame(animationId);
  });

  start().catch((error) => {
    if (!disposed) {
      console.error(error);
      document.getElementById('loadinginfo')!.textContent = 'Unable to load text rendering data.';
    }
  });

  return (
    <div>
      <div id="canvaswrap" class={s.canvaswrap}>
        {canvas}
      </div>
      <div id="toolbar" class={s.toolbar}>
        <a href="https://wdobbie.com/post/war-and-peace-and-webgl/" target="_blank" rel="noreferrer">
          Resolution independent GPU text rendering
        </a>
        <br />
        Drag to pan, scroll to zoom. Two fingers to pan, pinch and rotate.
        <label>
          {autoPan}
          Auto zoom
        </label>
        <label>
          <input type="checkbox" id="showgrids" onChange={forceAnimationChange} />
          Grids
        </label>
        <label>
          <input type="checkbox" id="vectoronly" onChange={forceAnimationChange} />
          Vector only
        </label>
        <input
          type="button"
          id="fsbutton"
          value="Fullscreen"
          onClick={() => canvas.parentElement?.requestFullscreen()}
        />
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
