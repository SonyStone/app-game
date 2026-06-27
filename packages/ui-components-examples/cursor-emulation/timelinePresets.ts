import { centerOfRect, clamp, type Point, type ViewportBounds } from './geometry';
import {
  action,
  createTimeline,
  move,
  parallel,
  pipe,
  pointer,
  set,
  toTimelineDefinition,
  wait,
  type TimelineDefinition,
  type TimelinePointerDefinition
} from './timeline';

const MOUSE_POINTER = {
  appearance: 'cursor',
  id: 'mouse',
  isPrimary: true,
  pointerId: 7,
  pointerType: 'mouse'
} as const satisfies TimelinePointerDefinition;

const TOUCH_POINTERS = [
  {
    appearance: 'touch',
    id: 'touch-a',
    isPrimary: true,
    pointerId: 21,
    pointerType: 'touch'
  },
  {
    appearance: 'touch',
    id: 'touch-b',
    isPrimary: false,
    pointerId: 22,
    pointerType: 'touch'
  }
] as const satisfies readonly [TimelinePointerDefinition, TimelinePointerDefinition];

export type ClickTimelineOptions = {
  readonly approachMs?: number;
  readonly departMs?: number;
  readonly pressMs?: number;
};

export type PinchTimelineOptions = {
  readonly zoomInMs?: number;
  readonly zoomOutMs?: number;
};

export function createCursorClickTimeline(
  targetRect: DOMRectReadOnly,
  viewport: ViewportBounds,
  options: ClickTimelineOptions = {}
): TimelineDefinition {
  const approachMs = options.approachMs ?? 1400;
  const pressMs = options.pressMs ?? 160;
  const departMs = options.departMs ?? 1150;
  const margin = 42;
  const horizontalOffset = Math.min(390, viewport.width * 0.34);
  const verticalOffset = Math.min(250, viewport.height * 0.3);
  const target = centerOfRect(targetRect);
  const start = {
    x: clamp(target.x - horizontalOffset, margin, viewport.width - margin),
    y: clamp(target.y - verticalOffset, margin, viewport.height - margin)
  };
  const end = {
    x: clamp(target.x + horizontalOffset, margin, viewport.width - margin),
    y: clamp(target.y + verticalOffset * 0.9, margin, viewport.height - margin)
  };
  return toTimelineDefinition(
    pipe(
      createTimeline(),
      pointer(MOUSE_POINTER),
      set(MOUSE_POINTER.id, start),
      move(MOUSE_POINTER.id, target, {
        controls: [
          {
            x: start.x + horizontalOffset * 0.42,
            y: clamp(start.y - verticalOffset * 0.24, margin, viewport.height - margin)
          },
          {
            x: target.x - horizontalOffset * 0.28,
            y: target.y - verticalOffset * 0.16
          }
        ],
        durationMs: approachMs,
        id: 'approach',
        phase: 'Approach'
      }),
      action(MOUSE_POINTER.id, 'pointerdown'),
      wait(pressMs, {
        id: 'press',
        phase: 'Press',
        pointerIds: [MOUSE_POINTER.id]
      }),
      action(MOUSE_POINTER.id, 'pointerup'),
      action(MOUSE_POINTER.id, 'click'),
      move(MOUSE_POINTER.id, end, {
        controls: [
          {
            x: target.x + horizontalOffset * 0.28,
            y: target.y + verticalOffset * 0.18
          },
          {
            x: end.x - horizontalOffset * 0.42,
            y: clamp(end.y + verticalOffset * 0.2, margin, viewport.height - margin)
          }
        ],
        durationMs: departMs,
        id: 'depart',
        phase: 'Depart'
      })
    )
  );
}

export function createPinchInOutTimeline(
  targetRect: DOMRectReadOnly,
  options: PinchTimelineOptions = {}
): TimelineDefinition {
  const zoomInMs = options.zoomInMs ?? 1150;
  const zoomOutMs = options.zoomOutMs ?? 1150;
  const center = centerOfRect(targetRect);
  const outerHalf = clamp(targetRect.width * 0.34, 72, targetRect.width / 2 - 36);
  const startHalf = clamp(42, 32, outerHalf - 56);
  const startOffset = 18;
  const outerOffset = 48;
  const firstStart = {
    x: center.x - startHalf,
    y: center.y - startOffset
  };
  const firstOuter = {
    x: center.x - outerHalf,
    y: center.y - outerOffset
  };
  const secondStart = {
    x: center.x + startHalf,
    y: center.y + startOffset
  };
  const secondOuter = {
    x: center.x + outerHalf,
    y: center.y + outerOffset
  };
  return toTimelineDefinition(
    pipe(
      createTimeline(),
      pointer(TOUCH_POINTERS[0]),
      pointer(TOUCH_POINTERS[1]),
      set(TOUCH_POINTERS[0].id, firstStart),
      set(TOUCH_POINTERS[1].id, secondStart),
      action(TOUCH_POINTERS[0].id, 'pointerdown'),
      action(TOUCH_POINTERS[1].id, 'pointerdown'),
      parallel([
        move(TOUCH_POINTERS[0].id, firstOuter, {
          controls: createPinchControls(firstStart, firstOuter, -1),
          durationMs: zoomInMs,
          id: 'zoom-in',
          phase: 'Zoom In'
        }),
        move(TOUCH_POINTERS[1].id, secondOuter, {
          controls: createPinchControls(secondStart, secondOuter, 1),
          durationMs: zoomInMs,
          id: 'zoom-in',
          phase: 'Zoom In'
        })
      ]),
      parallel([
        move(TOUCH_POINTERS[0].id, firstStart, {
          controls: createPinchControls(firstOuter, firstStart, 1),
          durationMs: zoomOutMs,
          id: 'zoom-out',
          phase: 'Zoom Out'
        }),
        move(TOUCH_POINTERS[1].id, secondStart, {
          controls: createPinchControls(secondOuter, secondStart, -1),
          durationMs: zoomOutMs,
          id: 'zoom-out',
          phase: 'Zoom Out'
        })
      ]),
      action(TOUCH_POINTERS[0].id, 'pointerup'),
      action(TOUCH_POINTERS[1].id, 'pointerup')
    )
  );
}

function createPinchControls(start: Point, end: Point, direction: -1 | 1): readonly [Point, Point] {
  return [
    {
      x: start.x + direction * 22,
      y: start.y + direction * 12
    },
    {
      x: end.x + direction * 16,
      y: end.y + direction * 6
    }
  ];
}
