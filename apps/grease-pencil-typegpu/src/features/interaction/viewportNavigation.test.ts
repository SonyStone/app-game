import { createSignal } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';
import type { ViewportMode } from '../../shared/viewportMode';
import { touchGestureDelta, touchGestureSample } from './touchGesture';
import { createViewportNavigation } from './viewportNavigation';
import type { InteractionViewport } from './viewportPort';

function setup(mode: ViewportMode = '2d', drawWithTouch = true) {
  const renderer = {
    orbit: vi.fn(),
    pan: vi.fn(),
    zoom: vi.fn(),
    transformTouch: vi.fn(),
    screenToWorld: () => undefined,
    worldUnitsPerPixel: () => 0.01,
    projectToScreen: () => undefined,
    offsetFromWorkplane: (position) => position,
    setWorkplaneGizmoHighlight: vi.fn()
  } satisfies InteractionViewport;
  const [, setLabel] = createSignal('Ready');
  return {
    renderer,
    navigation: createViewportNavigation({
      mode: () => 'draw',
      viewportMode: () => mode,
      touchDrawing: () => drawWithTouch,
      renderer: () => renderer,
      setPointerLabel: setLabel
    })
  };
}

function pointer(pointerId: number, x: number, y: number, pointerType = 'touch') {
  return { pointerId, clientX: x, clientY: y, pointerType, button: 0, buttons: 1 } as PointerEvent;
}

describe('tablet navigation', () => {
  it('uses one finger to orbit in 3D with touch drawing off', () => {
    const { navigation, renderer } = setup('3d', false);
    expect(navigation.startPointer(pointer(1, 10, 20))).toBe(true);
    navigation.movePointer(pointer(1, 30, 55));
    expect(renderer.orbit).toHaveBeenCalledWith(20, 35);
  });

  it('leaves one finger to draw in paper view, then takes over for pinch and twist', () => {
    const { navigation, renderer } = setup();
    expect(navigation.startPointer(pointer(1, 10, 10))).toBe(false);
    expect(navigation.startPointer(pointer(2, 110, 10))).toBe(true);
    navigation.movePointer(pointer(2, 10, 210));
    expect(renderer.transformTouch).toHaveBeenCalledWith({
      from: { x: 60, y: 10 },
      to: { x: 10, y: 110 },
      scale: 2,
      rotation: Math.PI / 2
    });
    expect(renderer.orbit).not.toHaveBeenCalled();
  });

  it('does not turn a remaining pinch finger into a stroke or make the camera jump', () => {
    const { navigation, renderer } = setup();
    navigation.startPointer(pointer(1, 10, 10));
    navigation.startPointer(pointer(2, 110, 10));
    navigation.releasePointer(pointer(2, 110, 10));
    expect(navigation.movePointer(pointer(1, 50, 70)).status).toBe('handled');
    expect(renderer.transformTouch).not.toHaveBeenCalled();
    navigation.releasePointer(pointer(1, 50, 70));
    expect(navigation.startPointer(pointer(3, 10, 10))).toBe(false);
  });

  it('ignores palm touches until they lift, even after the pen lifts', () => {
    const { navigation, renderer } = setup();
    expect(navigation.startPointer(pointer(1, 20, 20, 'pen'))).toBe(false);
    expect(navigation.startPointer(pointer(2, 10, 10))).toBe(true);
    navigation.startPointer(pointer(3, 110, 10));
    expect(navigation.isMultitouch()).toBe(false);
    navigation.movePointer(pointer(2, 40, 40));
    navigation.releasePointer(pointer(1, 20, 20, 'pen'));
    expect(navigation.movePointer(pointer(2, 80, 90)).status).toBe('ignored');
    expect(renderer.transformTouch).not.toHaveBeenCalled();
  });

  it('rebases the gesture when a third finger joins or leaves', () => {
    const { navigation, renderer } = setup();
    navigation.startPointer(pointer(1, 0, 0));
    navigation.startPointer(pointer(2, 100, 0));
    navigation.startPointer(pointer(3, 250, 200));
    navigation.releasePointer(pointer(1, 0, 0));
    navigation.movePointer(pointer(2, 100, 0));
    expect(renderer.transformTouch).toHaveBeenCalledWith(expect.objectContaining({ scale: 1, rotation: 0 }));
  });
});

it('wraps twist across the angle seam and ignores coincident finger rotation', () => {
  const from = { center: { x: 0, y: 0 }, distance: 50, angle: Math.PI - 0.05 };
  const to = { ...from, angle: -Math.PI + 0.05 };
  expect(touchGestureDelta(from, to).rotation).toBeCloseTo(0.1);
  expect(touchGestureDelta({ ...from, distance: 0 }, to)).toMatchObject({ scale: 1, rotation: 0 });
  expect(touchGestureSample([pointer(1, 0, 0)])).toBeUndefined();
});
