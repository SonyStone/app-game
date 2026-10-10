import { defaultCamera, screenToWorld, type Camera } from '@app-game/paint-core/camera';
import { describe, expect, it } from 'vitest';
import { draggedCamera, type ViewDragState } from './createViewDrag';
import { slotToward } from './slots';

const size = { width: 800, height: 600 };

describe('QuickMenu view drags', () => {
  it('pans the drawing with the pointer', () => {
    const camera = defaultCamera();
    const under = screenToWorld({ x: 100, y: 100 }, camera, size);
    const { camera: next } = draggedCamera(state('pan', { x: 100, y: 100 }), { x: 140, y: 70 }, false, camera, size);
    expect(screenToWorld({ x: 140, y: 70 }, next, size).x).toBeCloseTo(under.x);
    expect(screenToWorld({ x: 140, y: 70 }, next, size).y).toBeCloseTo(under.y);
  });

  it('zooms in when dragged up, twice per 115 px, keeping the pivot in place', () => {
    const camera = defaultCamera();
    const drag = state('zoom', { x: 300, y: 300 }, { x: 200, y: 150 });
    const pivot = screenToWorld(drag.pivot, camera, size);
    const { camera: next } = draggedCamera(drag, { x: 300, y: 185 }, false, camera, size);
    expect(next.zoom).toBeCloseTo(2);
    expect(screenToWorld(drag.pivot, next, size).x).toBeCloseTo(pivot.x);
    expect(screenToWorld(drag.pivot, next, size).y).toBeCloseTo(pivot.y);
  });

  it('turns the view by the angle swept around the pivot, past half a turn, snapping to 15° with Shift', () => {
    let camera: Camera = defaultCamera();
    let drag = state('rotate', { x: 500, y: 300 }, { x: 400, y: 300 });
    // A quarter turn clockwise, then on to 200° in steps, as a pointer circles the pivot.
    for (const degrees of [45, 90, 135, 180, 200]) {
      const radians = (degrees * Math.PI) / 180;
      const at = { x: 400 + Math.cos(radians) * 100, y: 300 + Math.sin(radians) * 100 };
      ({ drag, camera } = draggedCamera(drag, at, false, camera, size));
    }

    expect((camera.angle * 180) / Math.PI).toBeCloseTo(200);
    const snapped = draggedCamera(
      drag,
      { x: 400 + Math.cos(3.5) * 100, y: 300 + Math.sin(3.5) * 100 },
      true,
      camera,
      size
    );
    expect((snapped.camera.angle * 180) / Math.PI).toBeCloseTo(195);
  });

  it('ignores rotation near the pivot, where the direction is unstable', () => {
    const camera = defaultCamera();
    const { camera: next } = draggedCamera(
      state('rotate', { x: 500, y: 300 }, { x: 400, y: 300 }),
      { x: 405, y: 310 },
      false,
      camera,
      size
    );
    expect(next).toBe(camera);
  });
});

describe('QuickMenu flick directions', () => {
  it('points at the button in the direction of the move', () => {
    expect(slotToward(0, -50).id).toBe('zoom');
    expect(slotToward(40, -20).id).toBe('rotate');
    expect(slotToward(40, 25).id).toBe('redo');
    expect(slotToward(0, 50).id).toBe('picker');
    expect(slotToward(-40, 25).id).toBe('undo');
    expect(slotToward(-40, -20).id).toBe('pan');
  });
});

/** A drag that started at `at` around `pivot`. */
function state(kind: ViewDragState['kind'], at: { x: number; y: number }, pivot = at): ViewDragState {
  return {
    kind,
    last: at,
    pivot,
    pointerAngle: Math.atan2(at.y - pivot.y, at.x - pivot.x),
    swept: 0,
    startAngle: 0
  };
}
