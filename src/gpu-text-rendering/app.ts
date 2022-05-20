var canvas;
var gl;
var glext;
var timerQuery, waitingForTimer, lastFrametime;
var glyphProgram, glyphProgramNoRast, pageProgram, imageProgram;
var atlasTexture;
var glyphBuffer;
var pageBuffer;
var imageBuffer;
var pageData;
var indexCount = 0;
var int16PerVertex = 6; // const
var int16PerGlyph = 10;
var imageTextures = {};
var preAtlasTexture;
var positions = { x: [], y: [] }; // for auto zoom
var mustRenderNextFrame = false;






var transform = {
  x: 0.5,
  y: 0.5,
  zoom: 2
}

var animTransform = {
  x: 0,
  y: 0,
  zoom: 2
}

var lastAnimationTimestamp;
var animationDuration = 60;

function mix(b, a, t) {
  if (t < 0) t = 0;
  else if (t > 1) t = 1;

  return a * t + b * (1 - t);
}

function log(s) {
  console.log(s);
  document.getElementById("loadinginfo").textContent += s + "\n";
}

function approxEqual(a, b) {
  return Math.abs(a - b) < 0.00000001;

  /*
  if (Math.abs(b) < Math.abs(a)) {
    var t = b;
    b = a;
    a = t;
  }
  var threshhold = 0.99999999
  if (b == 0) return a == b;
  return (a/b) > threshhold;
  */
}

function getAnimatedValue(value, target, elapsed) {
  if (isNaN(value)) return target;

  var newval = mix(value, target, elapsed / animationDuration);
  if (approxEqual(newval, target)) {
    // snap to target if we're close
    newval = target;
  }
  return newval;
}

function updateAnimations(timestamp) {
  var elapsed = lastAnimationTimestamp ? timestamp - lastAnimationTimestamp : 0;

  var changed = mustRenderNextFrame;
  mustRenderNextFrame = false;
  for (var key in animTransform) {
    if (isNaN(transform[key])) {
      transform[key] = 0.5;
    }

    var newval = getAnimatedValue(animTransform[key], transform[key], elapsed);
    if (newval != animTransform[key]) {
      changed = true;
    }
    animTransform[key] = newval;
  }

  lastAnimationTimestamp = timestamp;

  return changed;
}

function finishAnimations() {
  for (var key in animTransform) {
    animTransform[key] = transform[key];
  }
  forceAnimationChange();
}

function forceAnimationChange() {
  mustRenderNextFrame = true;
}







function transposeBytes(buf, innerDim) {
  var inputArray = new Uint8Array(buf);
  var outputArray = new Uint8Array(inputArray.length);

  var outerDim = inputArray.length / innerDim;

  for (var i = 0; i < innerDim; i++) {
    for (var j = 0; j < outerDim; j++) {
      outputArray[j * innerDim + i] = inputArray[i * outerDim + j];
    }
  }

  return outputArray.buffer;
}

function boxesIntersect(a, b) {
  return a.x0 < b.x1 && a.y0 < b.y1 && a.x1 > b.x0 && a.y1 > b.y0;
}



function doGlyphVertexAttribPointers(prog) {
  var stride = int16PerVertex * 2;
  gl.vertexAttribPointer(prog.attributes.aPosition, 2, gl.SHORT, true, stride, 0);
  gl.vertexAttribPointer(prog.attributes.aCurvesMin, 2, gl.UNSIGNED_SHORT, false, stride, 2 * 2);
  gl.vertexAttribPointer(prog.attributes.aColor, 4, gl.UNSIGNED_BYTE, true, stride, 4 * 2);
}






function setCanvasSize() {
  var devicePixelRatio = window.devicePixelRatio || 1;
  if (window.innerWidth && window.outerWidth) {
    devicePixelRatio *= window.innerWidth / window.outerWidth;
  }

  var e = document.getElementById("canvaswrap");
  var w = Math.round(e.clientWidth * devicePixelRatio);
  var h = Math.round(e.clientHeight * devicePixelRatio);

  if (canvas.width != w || canvas.height != h) {
    canvas.width = w;
    canvas.height = h;
  }
}

function setPageUniforms(program, page, zoomx, zoomy) {
  // Shader would have done:
  //pos = (pos - uTranslate) / uZoom;
  //So, pos * (1/uZoom) + (-uTranslate/uZoom);
  var translateX = page.x + animTransform.x;
  var translateY = page.y + animTransform.y;

  var pageNdc = {
    x0: (0 - translateX) / zoomx * canvas.height / canvas.width,
    x1: (1 - translateX) / zoomx * canvas.height / canvas.width,
    y0: (0 - translateY) / zoomy,
    y1: (1 - translateY) / zoomy,
  }
  var viewportNdc = {
    x0: -1,
    x1: 1,
    y0: -1,
    y1: 1,
  }
  if (!boxesIntersect(pageNdc, viewportNdc)) {
    return false;
  }

  var aspect = canvas.height / canvas.width;

  gl.uniform2f(program.uniforms.uPositionMul, aspect / zoomx, 1 / zoomy);
  gl.uniform2f(program.uniforms.uPositionAdd, aspect * -translateX / zoomx, -translateY / zoomy);

  return true;
}

function computePageLocations() {
  var cols = Math.floor(Math.sqrt(pageData.length / canvas.height * canvas.width / pageData[0].width * pageData[0].height));

  for (var i = 0; i < pageData.length; i++) {
    var page = pageData[i];
    page.x = -(i % cols);
    page.y = Math.floor(i / cols);

    var gap = 1.06;
    page.x *= gap;
    page.y *= gap;
  }

}


var lastAutoChange = -1e6;
var panFromX = 0,
  panFromY = 0,
  panToX = 0,
  panToY = 0;







var prevPinchDiff = -1;






function fullscreen() {
  var e = document.getElementById("canvaswrap")
  if (e.requestFullscreen) {
    e.requestFullscreen();
  } else if (e.webkitRequestFullScreen) {
    e.webkitRequestFullScreen();
  } else if (e.mozRequestFullScreen) {
    e.mozRequestFullScreen();
  } else if (canvas.msRequestFullscreen) {
    e.msRequestFullscreen();
  }

  forceAnimationChange();
}


