import { makeEventListener } from '@solid-primitives/event-listener';

type Point = { x: number; y: number };

/** Where the turret should point: a screen position to look at, or a direction in screen axes. */
export type Aim = { kind: 'point'; x: number; y: number } | { kind: 'direction'; angle: number };

/**
 * Collects player input from keyboard, mouse, touch and the first gamepad, after the Godot
 * prototype's input map. Listeners stay attached until the calling owner is disposed.
 *
 * - Keyboard: WASD or arrows drive, Space fires, Q/E turn the view, +/- zoom. Keys are read by
 *   physical position, so WASD works in any layout. The page doesn't scroll on arrows or Space,
 *   unless an input element has the focus.
 * - Mouse: the turret follows the cursor, the left button fires, the right button is the second
 *   action, the wheel zooms.
 * - Touch and pen: a touch starting in the left 40% of the screen is a floating drive stick; any
 *   other touch aims at its position and fires while held.
 * - Gamepad: left stick drives, right stick aims, right trigger fires.
 *
 * @param target - Element receiving pointer and wheel input, normally the game canvas.
 */
export function makeArenaInput(target: HTMLElement) {
  const keys = new Set<string>();
  let aim: Aim | undefined;
  let mouseFire = false;
  let mouseAlt = false;
  let zoomFactor = 1;
  let stick: { pointerId: number; origin: Point; knob: Point } | undefined;
  const firePointers = new Set<number>();

  makeEventListener(window, 'keydown', (event) => {
    // A focused form control, such as a menu's slider, keeps its own arrows and Space.
    if (GAME_KEYS.has(event.code) && !(event.target instanceof HTMLInputElement)) {
      event.preventDefault();
    }

    keys.add(event.code);
  });
  makeEventListener(window, 'keyup', (event) => keys.delete(event.code));
  makeEventListener(window, 'blur', () => {
    keys.clear();
    mouseFire = false;
    mouseAlt = false;
  });

  makeEventListener(target, 'contextmenu', (event) => event.preventDefault());
  makeEventListener(
    target,
    'wheel',
    (event) => {
      event.preventDefault();
      zoomFactor *= Math.exp(-event.deltaY / 500);
    },
    { passive: false }
  );

  makeEventListener(target, 'pointerdown', (event) => {
    target.setPointerCapture(event.pointerId);

    if (event.pointerType === 'mouse') {
      aim = { kind: 'point', x: event.offsetX, y: event.offsetY };
      mouseFire ||= event.button === 0;
      mouseAlt ||= event.button === 2;
      return;
    }

    if (!stick && event.offsetX < target.clientWidth * STICK_ZONE) {
      const origin = { x: event.offsetX, y: event.offsetY };
      stick = { pointerId: event.pointerId, origin, knob: origin };
      return;
    }

    firePointers.add(event.pointerId);
    aim = { kind: 'point', x: event.offsetX, y: event.offsetY };
  });

  makeEventListener(target, 'pointermove', (event) => {
    if (stick?.pointerId === event.pointerId) {
      stick.knob = { x: event.offsetX, y: event.offsetY };
      return;
    }

    if (event.pointerType === 'mouse' || firePointers.has(event.pointerId)) {
      aim = { kind: 'point', x: event.offsetX, y: event.offsetY };
    }

    // A second button pressed or let go while another is held only shows in the buttons of a move.
    if (event.pointerType === 'mouse') {
      mouseFire = (event.buttons & 1) !== 0;
      mouseAlt = (event.buttons & 2) !== 0;
    }
  });

  const release = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') {
      mouseFire = (event.buttons & 1) !== 0;
      mouseAlt = (event.buttons & 2) !== 0;
    }

    if (stick?.pointerId === event.pointerId) {
      stick = undefined;
    }

    firePointers.delete(event.pointerId);
  };
  makeEventListener(target, 'pointerup', release);
  makeEventListener(target, 'pointercancel', release);

  return {
    /**
     * Reads the input for this frame and polls the gamepad. Aim persists from the last device
     * that aimed. The wheel zoom accumulated since the previous read is consumed.
     */
    read() {
      const pad = connectedGamepad();
      const drive = { x: axis(keys, 'right') - axis(keys, 'left'), y: axis(keys, 'down') - axis(keys, 'up') };

      if (pad) {
        drive.x += pad.axes[0] ?? 0;
        drive.y += pad.axes[1] ?? 0;
        const look = applyDeadzone({ x: pad.axes[2] ?? 0, y: pad.axes[3] ?? 0 });

        if (look.x !== 0 || look.y !== 0) {
          aim = { kind: 'direction', angle: Math.atan2(look.y, look.x) };
        }
      }

      if (stick) {
        drive.x += (stick.knob.x - stick.origin.x) / STICK_RADIUS;
        drive.y += (stick.knob.y - stick.origin.y) / STICK_RADIUS;
      }

      const zoomKeys = (keys.has('Equal') || keys.has('NumpadAdd') ? 1 : 0) - (keys.has('Minus') || keys.has('NumpadSubtract') ? 1 : 0);
      const zoom = zoomFactor;
      zoomFactor = 1;

      return {
        /** Drive direction in screen axes, length up to 1. */
        move: applyDeadzone(drive),
        aim,
        fire: mouseFire || firePointers.size > 0 || keys.has('Space') || (pad?.buttons[RIGHT_TRIGGER]?.value ?? 0) > 0.5,
        /** The second action, such as spinning a gatling or turning a casemate gun: the right mouse button, Shift or the left trigger. */
        alt: mouseAlt || keys.has('ShiftLeft') || keys.has('ShiftRight') || (pad?.buttons[LEFT_TRIGGER]?.value ?? 0) > 0.5,
        /** View rotation direction: 1 turns the world clockwise. */
        turn: (keys.has('KeyQ') ? 1 : 0) - (keys.has('KeyE') ? 1 : 0),
        /** Zoom multiplier from the wheel since the previous read. */
        zoom,
        /** Held zoom keys: 1 zooms in, -1 zooms out. */
        zoomKeys
      };
    },

    /** The touch drive stick in screen pixels while a finger holds it. */
    stick() {
      if (!stick) {
        return undefined;
      }

      return { origin: stick.origin, knob: clampToRadius(stick.origin, stick.knob, STICK_RADIUS), radius: STICK_RADIUS };
    },

    /** Gives the shot kick Godot used: the strong gamepad motor at half strength for 0.1 s. */
    rumble() {
      void connectedGamepad()?.vibrationActuator?.playEffect('dual-rumble', {
        duration: 100,
        weakMagnitude: 0,
        strongMagnitude: 0.5
      });
    }
  };
}

const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const DRIVE_KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight']
};
const STICK_ZONE = 0.4;
const STICK_RADIUS = 60;
const DEADZONE = 0.2;

/** Standard-mapping indices of the right trigger, Godot's joypad axis 5, and the left trigger. */
const RIGHT_TRIGGER = 7;
const LEFT_TRIGGER = 6;

function axis(keys: ReadonlySet<string>, direction: keyof typeof DRIVE_KEYS) {
  return DRIVE_KEYS[direction].some((code) => keys.has(code)) ? 1 : 0;
}

/**
 * Godot's `Input.get_vector` shaping: lengths under the deadzone become zero, the rest is
 * rescaled to start from zero at the deadzone and capped at length 1.
 */
function applyDeadzone(vector: Point) {
  const length = Math.hypot(vector.x, vector.y);

  if (length <= DEADZONE) {
    return { x: 0, y: 0 };
  }

  const scale = Math.min((length - DEADZONE) / (1 - DEADZONE), 1) / length;

  return { x: vector.x * scale, y: vector.y * scale };
}

function connectedGamepad() {
  return navigator.getGamepads?.().find((pad) => pad?.connected) ?? undefined;
}

function clampToRadius(origin: Point, point: Point, radius: number) {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const length = Math.hypot(dx, dy);

  if (length <= radius) {
    return point;
  }

  return { x: origin.x + (dx / length) * radius, y: origin.y + (dy / length) * radius };
}
