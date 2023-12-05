export const MOBILE_REGEX = /mobile|tablet|ip(ad|hone|od)|android/i;

export const SUPPORT_TOUCH = 'ontouchstart' in window;
// export const SUPPORT_POINTER_EVENTS = prefixed(window, 'PointerEvent') !== undefined;
export const SUPPORT_ONLY_TOUCH = SUPPORT_TOUCH && MOBILE_REGEX.test(navigator.userAgent);

export const INPUT_TYPE_TOUCH = 'touch';
export const INPUT_TYPE_PEN = 'pen';
export const INPUT_TYPE_MOUSE = 'mouse';
export const INPUT_TYPE_KINECT = 'kinect';

export const COMPUTE_INTERVAL = 25;

export const INPUT_START = 1;
export const INPUT_MOVE = 2;
export const INPUT_END = 4;
export const INPUT_CANCEL = 8;

export const enum DIRECTION {
  NONE = 1,
  LEFT = 2,
  RIGHT = 4,
  UP = 8,
  DOWN = 16
}

export const DIRECTION_HORIZONTAL = DIRECTION.LEFT | DIRECTION.RIGHT;
export const DIRECTION_VERTICAL = DIRECTION.UP | DIRECTION.DOWN;
export const DIRECTION_ALL = DIRECTION_HORIZONTAL | DIRECTION_VERTICAL;

export const PROPS_XY = ['x', 'y'];
export const PROPS_CLIENT_XY = ['clientX', 'clientY'];
