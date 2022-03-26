export function captureKeyboard(element: Window) {
  const key = {
    left: { code: 37, pressed: false },
    right: { code: 39, pressed: false },
    up: { code: 38, pressed: false },
    down: { code: 40, pressed: false },
    w: { code: 87, pressed: false },
    a: { code: 65, pressed: false },
    s: { code: 83, pressed: false },
    d: { code: 68, pressed: false },
    e: { code: 69, pressed: false },
    q: { code: 81, pressed: false },
    x: { code: 88, pressed: false },
    z: { code: 90, pressed: false },
    NumpadAdd: { code: 107, pressed: false },
    NumpadSub: { code: 109, pressed: false }
  };

  element.addEventListener('keydown', function (event) {
    let name;
    for (name in key) {
      if (key.hasOwnProperty(name)) {
        if (key[name].code === event.keyCode) {
          key[name].pressed = true;
        }
      }
    }
  }, false);

  element.addEventListener('keyup', function (event) {
    let name;
    for (name in key) {
      if (key.hasOwnProperty(name)) {
        if (key[name].code === event.keyCode) {
          key[name].pressed = false;
        }
      }
    }
  }, false);

  return key;
}
