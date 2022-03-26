export function captureMouse(element: HTMLElement) {
  const mouse = {
    x: 0,
    y: 0,
    LButton: { code: 0, pressed: false },
    RButton: { code: 2, pressed: false },
    MButton: { code: 1, pressed: false },
    WheelUp: {
      click: false,
      get pressed() {
        if (this.click) {
          this.click = false;
          return true;
        }
        return false;
      }
    },
    WheelDown: {
      click: false,
      get pressed() {
        if (this.click) {
          this.click = false;
          return true;
        }
        return false;
      },
    },
  };

  element.oncontextmenu = function(a) {
    a.preventDefault();
  };

  element.addEventListener('mousemove', function(event) {
    let x: number;
    let y: number;
    const mouse_event = eventPositionCapture(x, y, event, element);
    mouse.x = mouse_event.x;
    mouse.y = mouse_event.y;
  }, false);

  element.addEventListener('mousedown', function(event) {
    let name;
    for (name in mouse) {
      if (mouse.hasOwnProperty(name)) {
        if (mouse[name].code === event.button) {
          mouse[name].pressed = true;
        }
      }
    }
  }, false);

  element.addEventListener('mouseup', function(event) {
    for (const name in mouse) {
      if (mouse.hasOwnProperty(name)) {
        if (mouse[name].code === event.button) {
          mouse[name].pressed = false;
        }
      }
    }
  }, false);

  element.addEventListener('wheel', function(event) {
    if (event.deltaY < 0) {
      mouse['WheelUp'].click = true;
    } else {
      mouse['WheelDown'].click = true;
    }
  }, false);

  return mouse;
}

function eventPositionCapture(x, y, event, element) {
  if (event.pageX || event.pageY) { // он будет проверять каждый раз? O_o
    x = event.pageX;
    y = event.pageY;
  } else {
    x = event.clientX + document.body.scrollLeft +
      document.documentElement.scrollLeft;
    y = event.clientY + document.body.scrollTop +
      document.documentElement.scrollTop;
  }
  x -= element.offsetLeft;
  y -= element.offsetTop;
  return { x, y };
}
