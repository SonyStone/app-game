import {
  GL_BUFFER_TYPE,
  GL_CLEAR_MASK,
  GL_STATIC_VARIABLES,
  GL_TEXTURES,
} from "@webgl/static-variables";
import {
  GL_TEXTURE_TARGET,
  GL_TEXTURE_UNIT,
} from "@webgl/static-variables/textures";

import { ExtWebGLProgram } from "./createProgram";
import { getImageTexture } from "./getImageTexture";
import { ExtWebGLTexture } from "./processAtlas";
import { mustRenderNextFrame } from "./renderNextFrame";

const transform = {
  x: 0.5,
  y: 0.5,
  zoom: 2,
};
const animTransform = {
  x: 0,
  y: 0,
  zoom: 2,
};
const positions = { x: [], y: [] };
let lastAutoChange = -1e6;
let panFromX = 0;
let panFromY = 0;
let panToX = 0;
let panToY = 0;

const animationDuration = 60;
const int16PerVertex = 6; // const

export function drawScene(
  glyphProgram: ExtWebGLProgram,
  glyphBuffer: WebGLBuffer,
  pageData: any,
  atlasTexture: ExtWebGLTexture,
  preAtlasTexture: ExtWebGLTexture,
  canvas: HTMLCanvasElement,
  gl: WebGLRenderingContext,
  waitingForTimer: boolean,
  lastFrametime: number,
  pageProgram: ExtWebGLProgram,
  glext: any,
  pageBuffer: WebGLBuffer,
  imageBuffer: WebGLBuffer,
  imageProgram: ExtWebGLProgram,
  glyphProgramNoRast: ExtWebGLProgram,
  timestamp: number,
  timerQuery?: WebGLQuery
) {
  if (
    glyphProgram == null ||
    !glyphBuffer ||
    !pageData ||
    !atlasTexture ||
    !preAtlasTexture
  ) {
    return;
  }
  var firstFrame =
    document.getElementById("loadinginfo")!.style.visibility != "hidden";
  if (firstFrame) {
    document.getElementById("loadinginfo")!.style.visibility = "hidden";
    canvas.style.display = "block"; // force reflow on ios
  }

  var zoomx = animTransform.zoom;
  var zoomy = (zoomx * pageData[0].width) / pageData[0].height;

  var autoPan = (document.getElementById("autopan")! as HTMLInputElement)
    .checked;
  if (autoPan) {
    var interval = 14000;
    if (timestamp - lastAutoChange > interval) {
      lastAutoChange = timestamp;
      var page = pageData[Math.floor(Math.random() * pageData.length)];
      var glyph =
        Math.floor(Math.random() * (page.endVertex - page.beginVertex)) +
        page.beginVertex;
      glyph = Math.floor(glyph / 6);

      panFromX = panToX;
      panFromY = panToY;

      panToX = -page.x + positions.x[glyph];
      panToY = -page.y + 1.0 - positions.y[glyph];
    }

    var t = (timestamp - lastAutoChange) / interval;

    var zoomin = Math.pow(2, -7);
    var zoomout = Math.pow(2, 1.5);
    var clip = 0.3;
    var za = 0.8;
    if (t < clip) {
      transform.zoom = blend(zoomin, zoomout, t / clip, za);
    } else if (t > 1.0 - clip) {
      transform.zoom = blend(zoomout, zoomin, (t - 1.0 + clip) / clip, za);
    } else {
      transform.zoom = zoomout;
    }

    transform.x = blend(panFromX, panToX, t);
    transform.y = blend(panFromY, panToY, t);

    if (firstFrame) {
      lastAutoChange = -1e6;
    }
  }

  if (!updateAnimations(timestamp) && !firstFrame) {
    return;
  }

  setCanvasSize(canvas);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(160 / 255, 169 / 255, 175 / 255, 1.0);
  gl.clear(GL_CLEAR_MASK.COLOR_BUFFER_BIT);

  if (timerQuery) {
    if (waitingForTimer) {
      var available = glext.getQueryObjectEXT(
        timerQuery,
        glext.QUERY_RESULT_AVAILABLE_EXT
      );
      var disjoint = gl.getParameter(glext.GPU_DISJOINT_EXT);
      if (available) {
        if (lastFrametime == null || timestamp - lastFrametime > 100) {
          lastFrametime = timestamp;
          var elapsed = glext.getQueryObjectEXT(
            timerQuery,
            glext.QUERY_RESULT_EXT
          );
          (
            document.getElementById("frametime")! as HTMLInputElement
          ).value = `${elapsed / 1e6}`;
        }
        waitingForTimer = false;
      }
    }

    if (!waitingForTimer) {
      glext.beginQueryEXT(glext.TIME_ELAPSED_EXT, timerQuery);
    }
  }

  // Draw page backgrounds
  gl.useProgram(pageProgram);
  gl.disable(GL_STATIC_VARIABLES.BLEND);
  var aspect = canvas.height / canvas.width;
  gl.uniform2f(pageProgram.uniforms!.uPositionMul, aspect / zoomx, 1 / zoomy);
  gl.uniform2f(
    pageProgram.uniforms!.uPositionAdd,
    (aspect * -animTransform.x) / zoomx,
    -animTransform.y / zoomy
  );
  gl.bindBuffer(GL_BUFFER_TYPE.ARRAY_BUFFER, pageBuffer);
  enableAttributes(gl, pageProgram);
  gl.vertexAttribPointer(
    pageProgram.attributes!.aPosition,
    2,
    gl.FLOAT,
    false,
    0,
    0
  );
  gl.drawArrays(GL_STATIC_VARIABLES.TRIANGLE_STRIP, 0, pageData.length * 6);
  disableAttributes(gl, pageProgram);

  // Draw images
  if (imageBuffer) {
    gl.useProgram(imageProgram);
    gl.bindBuffer(GL_BUFFER_TYPE.ARRAY_BUFFER, imageBuffer);
    gl.enable(GL_STATIC_VARIABLES.BLEND);
    enableAttributes(gl, imageProgram);
    var bytesPerImageVertex = 10;
    gl.vertexAttribPointer(
      imageProgram.attributes!.aPosition,
      2,
      GL_STATIC_VARIABLES.UNSIGNED_SHORT,
      true,
      bytesPerImageVertex,
      0
    );
    gl.vertexAttribPointer(
      imageProgram.attributes!.aTexCoord,
      2,
      GL_STATIC_VARIABLES.UNSIGNED_SHORT,
      true,
      bytesPerImageVertex,
      4
    );
    gl.vertexAttribPointer(
      imageProgram.attributes!.aAlpha,
      1,
      gl.UNSIGNED_BYTE,
      true,
      bytesPerImageVertex,
      8
    );
    gl.vertexAttribPointer(
      imageProgram.attributes!.aInvert,
      1,
      gl.UNSIGNED_BYTE,
      true,
      bytesPerImageVertex,
      9
    );

    gl.activeTexture(GL_TEXTURE_UNIT.TEXTURE0);
    gl.uniform1i(imageProgram.uniforms!.uSampler, 0);

    for (var i = 0; i < pageData.length; i++) {
      if (
        setPageUniforms(gl, canvas, imageProgram, pageData[i], zoomx, zoomy)
      ) {
        var images = pageData[i].images;
        if (images) {
          for (var j = 0; j < images.length; j++) {
            var img = images[j];
            var handle = getImageTexture(gl, img.filename);
            if (handle) {
              gl.bindTexture(GL_TEXTURE_TARGET.TEXTURE_2D, handle);
              gl.drawArrays(
                GL_STATIC_VARIABLES.TRIANGLE_STRIP,
                img.vertexOffset,
                img.numVerts
              );
            }
          }
        }
      }
    }
    disableAttributes(gl, imageProgram);
  }

  // Draw glyphs
  const prog = (document.getElementById("vectoronly") as HTMLInputElement)
    .checked
    ? glyphProgramNoRast
    : glyphProgram;

  gl.useProgram(prog);
  gl.bindBuffer(GL_BUFFER_TYPE.ARRAY_BUFFER, glyphBuffer);
  gl.enable(GL_STATIC_VARIABLES.BLEND);

  enableAttributes(gl, prog);
  doGlyphVertexAttribPointers(gl, prog);

  gl.activeTexture(GL_TEXTURE_UNIT.TEXTURE0);
  gl.bindTexture(GL_TEXTURE_TARGET.TEXTURE_2D, atlasTexture);
  gl.uniform1i(prog.uniforms!.uAtlasSampler, 0);

  gl.activeTexture(GL_TEXTURE_UNIT.TEXTURE1);
  gl.bindTexture(GL_TEXTURE_TARGET.TEXTURE_2D, preAtlasTexture);
  gl.uniform1i(prog.uniforms!.uRasteredAtlasSampler, 1);

  gl.uniform2f(
    prog.uniforms!.uTexelSize,
    1 / atlasTexture.width!,
    1 / atlasTexture.height!
  );
  gl.uniform2f(
    prog.uniforms!.uRasteredTexelSize,
    1 / preAtlasTexture.width!,
    1 / preAtlasTexture.height!
  );
  gl.uniform1i(
    prog.uniforms!.uDebug,
    (document.getElementById("showgrids") as HTMLInputElement).checked ? 1 : 0
  );

  for (var i = 0; i < pageData.length; i++) {
    var page = pageData[i];
    if (setPageUniforms(gl, canvas, prog, page, zoomx, zoomy)) {
      gl.drawArrays(
        GL_STATIC_VARIABLES.TRIANGLES,
        page.beginVertex,
        page.endVertex - page.beginVertex
      );
    }
  }
  disableAttributes(gl, prog);

  if (timerQuery && !waitingForTimer) {
    glext.endQueryEXT(glext.TIME_ELAPSED_EXT);
    waitingForTimer = true;
  }

  lastDrawTime = timestamp;
}
var lastDrawTime;

function lerp(from: number, to: number, t: number) {
  return (to - from) * t + from;
}

function doubleExponentialSigmoid(x: number, a: number) {
  var epsilon = 0.00001;
  var min_param_a = 0.0 + epsilon;
  var max_param_a = 1.0 - epsilon;
  a = Math.min(max_param_a, Math.max(min_param_a, a));
  a = 1.0 - a; // for sensible results

  var y = 0;
  if (x <= 0.5) {
    y = Math.pow(2.0 * x, 1.0 / a) / 2.0;
  } else {
    y = 1.0 - Math.pow(2.0 * (1.0 - x), 1.0 / a) / 2.0;
  }
  return y;
}

function blend(from: number, to: number, t: number, a?: number) {
  if (a == null) {
    a = 0.9;
  }
  return lerp(from, to, doubleExponentialSigmoid(t, a));
}

function enableAttributes(gl: WebGLRenderingContext, prog: ExtWebGLProgram) {
  for (var a in prog.attributes) {
    gl.enableVertexAttribArray(prog.attributes[a]);
  }
}

function disableAttributes(gl: WebGLRenderingContext, prog: ExtWebGLProgram) {
  for (var a in prog.attributes) {
    gl.disableVertexAttribArray(prog.attributes[a]);
  }
}

let lastAnimationTimestamp = 0;
function updateAnimations(timestamp: number) {
  var elapsed = lastAnimationTimestamp ? timestamp - lastAnimationTimestamp : 0;

  var changed = mustRenderNextFrame.value;
  mustRenderNextFrame.value = false;
  for (var key in animTransform) {
    if (isNaN((transform as any)[key])) {
      (transform as any)[key] = 0.5;
    }

    var newval = getAnimatedValue(
      (animTransform as any)[key],
      (transform as any)[key],
      elapsed
    );
    if (newval != (animTransform as any)[key]) {
      changed = true;
    }
    (animTransform as any)[key] = newval;
  }

  lastAnimationTimestamp = timestamp;

  return changed;
}

function getAnimatedValue(value: number, target: number, elapsed: number) {
  if (isNaN(value)) return target;

  var newval = mix(value, target, elapsed / animationDuration);
  if (approxEqual(newval, target)) {
    // snap to target if we're close
    newval = target;
  }
  return newval;
}

function setCanvasSize(canvas: HTMLCanvasElement) {
  var devicePixelRatio = window.devicePixelRatio || 1;
  if (window.innerWidth && window.outerWidth) {
    devicePixelRatio *= window.innerWidth / window.outerWidth;
  }

  var e = document.getElementById("canvaswrap") as HTMLDivElement;
  var w = Math.round(e.clientWidth * devicePixelRatio);
  var h = Math.round(e.clientHeight * devicePixelRatio);

  if (canvas.width != w || canvas.height != h) {
    canvas.width = w;
    canvas.height = h;
  }
}

function setPageUniforms(
  gl: WebGLRenderingContext,
  canvas: HTMLCanvasElement,
  program: ExtWebGLProgram,
  page: any,
  zoomx: number,
  zoomy: number
) {
  // Shader would have done:
  //pos = (pos - uTranslate) / uZoom;
  //So, pos * (1/uZoom) + (-uTranslate/uZoom);
  var translateX = page.x + animTransform.x;
  var translateY = page.y + animTransform.y;

  var pageNdc = {
    x0: (((0 - translateX) / zoomx) * canvas.height) / canvas.width,
    x1: (((1 - translateX) / zoomx) * canvas.height) / canvas.width,
    y0: (0 - translateY) / zoomy,
    y1: (1 - translateY) / zoomy,
  };
  var viewportNdc = {
    x0: -1,
    x1: 1,
    y0: -1,
    y1: 1,
  };
  if (!boxesIntersect(pageNdc, viewportNdc)) {
    return false;
  }

  var aspect = canvas.height / canvas.width;

  gl.uniform2f(program.uniforms!.uPositionMul, aspect / zoomx, 1 / zoomy);
  gl.uniform2f(
    program.uniforms!.uPositionAdd,
    (aspect * -translateX) / zoomx,
    -translateY / zoomy
  );

  return true;
}

function doGlyphVertexAttribPointers(
  gl: WebGLRenderingContext,
  prog: ExtWebGLProgram
) {
  var stride = int16PerVertex * 2;
  gl.vertexAttribPointer(
    prog.attributes!.aPosition,
    2,
    GL_STATIC_VARIABLES.SHORT,
    true,
    stride,
    0
  );
  gl.vertexAttribPointer(
    prog.attributes!.aCurvesMin,
    2,
    GL_STATIC_VARIABLES.UNSIGNED_SHORT,
    false,
    stride,
    2 * 2
  );
  gl.vertexAttribPointer(
    prog.attributes!.aColor,
    4,
    GL_STATIC_VARIABLES.UNSIGNED_BYTE,
    true,
    stride,
    4 * 2
  );
}

function mix(b: number, a: number, t: number) {
  if (t < 0) t = 0;
  else if (t > 1) t = 1;

  return a * t + b * (1 - t);
}

function approxEqual(a: number, b: number) {
  return Math.abs(a - b) < 0.00000001;
}

function boxesIntersect(a: any, b: any) {
  return a.x0 < b.x1 && a.y0 < b.y1 && a.x1 > b.x0 && a.y1 > b.y0;
}
