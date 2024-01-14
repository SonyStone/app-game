import { describe, expect, test, vi } from 'vitest';

const events = [
  {
    type: 'pointerdown',
    pointerId: 1,
    pointerType: 'mouse',
    clientX: 0,
    clientY: 0
  },
  {
    type: 'pointermove',
    pointerId: 1,
    pointerType: 'mouse',
    clientX: 10,
    clientY: 0
  },
  {
    type: 'pointermove',
    pointerId: 1,
    pointerType: 'mouse',
    clientX: 20,
    clientY: 0
  },
  {
    type: 'pointerup',
    pointerId: 1,
    pointerType: 'mouse',
    clientX: 30,
    clientY: 0
  }
];

describe('hammer.js', () => {
  test('should give data from events', async () => {
    const elementRef = document.createElement('div');
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));

    const Hammer = await import('hammerjs');

    const mc = new Hammer.Manager(elementRef);
    const Pan = new Hammer.Pan();

    mc.add(Pan);

    const inputs: HammerInput[] = [];

    mc.on('pan', (e) => {
      inputs.push(e);
    });

    elementRef.dispatchEvent(new MockPointerEvent(events[0].type, events[0]));
    vi.setSystemTime(new Date(1000));
    window.dispatchEvent(new MockPointerEvent(events[1].type, events[1]));
    vi.setSystemTime(new Date(2000));
    window.dispatchEvent(new MockPointerEvent(events[2].type, events[2]));
    vi.setSystemTime(new Date(3000));
    window.dispatchEvent(new MockPointerEvent(events[3].type, events[3]));

    expect(inputs).toEqual([
      expect.objectContaining({
        additionalEvent: 'panright',
        angle: 0,
        center: {
          x: 20,
          y: 0
        },
        deltaTime: 2000, // delta from pointerdown
        deltaX: 20, // delta from pointerdown
        deltaY: 0,
        direction: 4,
        distance: 20,
        eventType: 2,
        isFinal: false,
        isFirst: false,
        maxPointers: 1,
        offsetDirection: 4,
        overallVelocity: 0.01,
        overallVelocityX: 0.01,
        overallVelocityY: 0,
        pointers: [],
        pointerType: 'mouse',
        rotation: 0,
        scale: 1,
        timeStamp: 2000,
        type: 'pan',
        velocity: 0.01,
        velocityX: 0.01,
        velocityY: 0
      }),
      expect.objectContaining({
        additionalEvent: 'panright',
        angle: 0,
        center: {
          x: 30,
          y: 0
        },
        deltaTime: 3000,
        deltaX: 30,
        deltaY: 0,
        direction: 4,
        distance: 30,
        eventType: 4,
        isFinal: true,
        isFirst: false,
        maxPointers: 1,
        offsetDirection: 4,
        overallVelocity: 0.01,
        overallVelocityX: 0.01,
        overallVelocityY: 0,
        pointers: [],
        pointerType: 'mouse',
        rotation: 0,
        scale: 1,
        timeStamp: 3000,
        type: 'pan',
        velocity: 0.01,
        velocityX: 0.01,
        velocityY: 0
      })
    ]);

    console.log('🔴 ???');
  });
});

class MockPointerEvent extends Event {
  pointerId: PointerEvent['pointerId'];
  pointerType: PointerEvent['pointerType'];
  clientX: PointerEvent['clientX'];
  clientY: PointerEvent['clientY'];
  button: PointerEvent['button'];

  constructor(type: string, object: Pick<PointerEvent, 'pointerId' | 'pointerType' | 'clientX' | 'clientY'>) {
    super(type);

    this.pointerId = object.pointerId;
    this.pointerType = object.pointerType;
    this.clientX = object.clientX;
    this.clientY = object.clientY;
    this.button = 0;
  }
}
