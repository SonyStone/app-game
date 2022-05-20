export function canvasTouchMove(e: TouchEvent) {
  var touch = e.targetTouches[0];


  if (e.targetTouches.length > 1) {
    handlePinch(e);
  } else {
    if (this.primaryTouchId != touch.identifier) {
      this.lastX = touch.clientX;
      this.lastY = touch.clientY;
      this.primaryTouchId = touch.identifier;
    }

    var scaleFactor = 4;
    transform.x -= scaleFactor * ((touch.clientX - this.lastX) / this.offsetWidth) * transform.zoom;
    transform.y += scaleFactor * ((touch.clientY - this.lastY) / this.offsetHeight) * transform.zoom;

    finishAnimations();
  }

  this.lastX = touch.clientX;
  this.lastY = touch.clientY;

  e.preventDefault();
}

export function canvasTouchStart(e) {
  var touch = e.targetTouches[0];
  this.lastX = touch.clientX;
  this.lastY = touch.clientY;
  this.primaryTouchId = touch.identifier;
  prevPinchDiff = -1;
}

function handlePinch(ev) {
  var touches = ev.targetTouches;

  if (touches.length == 2) {
    var dx = touches[0].clientX - touches[1].clientX;
    var dy = touches[0].clientY - touches[1].clientY;

    var curDiff = Math.sqrt(dx * dx + dy * dy);

    if (prevPinchDiff > 0) {
      changeZoom(-(curDiff - prevPinchDiff) / 80, ev);
      finishAnimations();
    }
    prevPinchDiff = curDiff;
  }
}

export function canvasMouseMove(e) {
  var btn = e.buttons;
  if (btn == null) {
    btn = e.which;
    if (btn == 3) btn = 2;
  }

  if (btn) {
    if (e.altKey || btn == 2) {
      var dx, dy;
      if (document.pointerLockElement || document.mozPointerLockElement || document.webkitPointerLockElement) {
        dx = e.movementX;
        dy = e.movementY;
      } else {
        dx = e.clientX - this.lastX;
        dy = e.clientY - this.lastY;
      }
      var dmax = Math.abs(dx) > Math.abs(dy) ? -dx : dy;
      changeZoom(7.0 * (dmax / this.offsetHeight), e);
    } else {
      var scaleFactor = 5.5;
      transform.x -= scaleFactor * ((e.clientX - this.lastX) / this.offsetWidth) * transform.zoom;
      transform.y += scaleFactor * ((e.clientY - this.lastY) / this.offsetHeight) * transform.zoom;
    }
  }

  this.lastX = e.clientX;
  this.lastY = e.clientY;
}

export function canvasMouseEnter(e) {
  this.lastX = e.clientX;
  this.lastY = e.clientY;
}

function changeZoom(amount, e) {
  var x = 0,
    y = 0;
  if (e && e.clientX != null) {
    var mul = 1;
    if (window.innerWidth && window.outerWidth) {
      mul = window.outerWidth / window.innerWidth;
    }

    x = e.clientX * mul / e.target.clientWidth * 2 - 1;
    y = 1 - e.clientY * mul / e.target.clientHeight * 2;
  }

  var zoomx = transform.zoom;
  var zoomy = zoomx * pageData[0].width / pageData[0].height;

  var worldx = x * canvas.width / canvas.height * zoomx + transform.x;
  var worldy = y * zoomy + transform.y;

  // Change coords and keep world position under cursor
  transform.zoom *= Math.pow(2, amount);

  zoomx = transform.zoom;
  zoomy = zoomx * pageData[0].width / pageData[0].height;

  transform.x = worldx - x * canvas.width / canvas.height * zoomx;
  transform.y = worldy - y * zoomy;
}

export function canvasMouseWheel(e) {
  var amt = e.deltaY;
  if (e.deltaMode == 1) amt *= 30;
  if (e.deltaMode == 2) amt *= 1000;
  changeZoom(amt / 200);

  e.preventDefault();
}
