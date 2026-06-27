import { cubicPathD, pointOnCubic, type CubicPath, type Point } from './geometry';

export type TimelinePointerType = 'mouse' | 'touch';

export type TimelinePointerAppearance = 'cursor' | 'touch';

export type TimelinePointerDefinition = {
  readonly appearance: TimelinePointerAppearance;
  readonly id: string;
  readonly isPrimary: boolean;
  readonly pointerId: number;
  readonly pointerType: TimelinePointerType;
};

export type TimelineTrackSegment = {
  readonly durationMs: number;
  readonly id: string;
  readonly path: CubicPath;
  readonly phase?: string;
  readonly startMs: number;
};

export type TimelineTrack = {
  readonly pointerId: string;
  readonly segments: readonly TimelineTrackSegment[];
};

export type TimelineActionKind = 'click' | 'pointerdown' | 'pointerup';

export type TimelineAction = {
  readonly atMs: number;
  readonly kind: TimelineActionKind;
  readonly pointerId: string;
};

export type TimelineDefinition = {
  readonly actions: readonly TimelineAction[];
  readonly durationMs: number;
  readonly pointers: readonly TimelinePointerDefinition[];
  readonly tracks: readonly TimelineTrack[];
};

export type TimelinePosition = {
  readonly phase?: string;
  readonly point: Point;
  readonly pointer: TimelinePointerDefinition;
};

export type TimelineSample = {
  readonly done: boolean;
  readonly elapsedMs: number;
  readonly phase: string;
  readonly positions: readonly TimelinePosition[];
};

export type TimelinePath = {
  readonly d: string;
  readonly id: string;
};

export type TimelineDraft = {
  readonly actions: TimelineAction[];
  readonly currentPoints: Map<string, Point>;
  readonly pointers: Map<string, TimelinePointerDefinition>;
  readonly tracks: Map<string, TimelineTrackSegment[]>;
  segmentIndex: number;
  timeMs: number;
};

export type TimelineOperator = (timeline: TimelineDraft) => TimelineDraft;

export type TimelineMoveOptions = {
  readonly controls?: readonly [Point, Point];
  readonly durationMs: number;
  readonly id?: string;
  readonly phase?: string;
};

export type TimelineWaitOptions = {
  readonly id?: string;
  readonly phase?: string;
  readonly pointerIds?: readonly string[];
};

export function action(pointerId: string, kind: TimelineActionKind): TimelineOperator {
  return (timeline) => {
    ensurePointer(timeline, pointerId);
    timeline.actions.push({
      atMs: timeline.timeMs,
      kind,
      pointerId
    });

    return timeline;
  };
}

export function createTimeline(): TimelineDraft {
  return {
    actions: [],
    currentPoints: new Map(),
    pointers: new Map(),
    segmentIndex: 0,
    timeMs: 0,
    tracks: new Map()
  };
}

export function move(pointerId: string, to: Point, options: TimelineMoveOptions): TimelineOperator {
  return (timeline) => {
    ensurePointer(timeline, pointerId);

    if (options.durationMs <= 0) {
      throw new Error(`Timeline move duration must be greater than 0 for pointer "${pointerId}".`);
    }

    const from = timeline.currentPoints.get(pointerId);

    if (!from) {
      throw new Error(`Cannot move pointer "${pointerId}" before it has been set.`);
    }

    addSegment(timeline, pointerId, {
      durationMs: options.durationMs,
      id: options.id ?? nextSegmentId(timeline, 'move'),
      path: options.controls ? [from, options.controls[0], options.controls[1], to] : createLinePath(from, to),
      phase: options.phase,
      startMs: timeline.timeMs
    });
    timeline.currentPoints.set(pointerId, to);
    timeline.timeMs += options.durationMs;

    return timeline;
  };
}

export function parallel(operators: readonly TimelineOperator[]): TimelineOperator {
  return (timeline) => {
    const startMs = timeline.timeMs;
    let endMs = startMs;

    for (const operator of operators) {
      timeline.timeMs = startMs;
      operator(timeline);
      endMs = Math.max(endMs, timeline.timeMs);
    }

    timeline.timeMs = endMs;

    return timeline;
  };
}

export function pipe(timeline: TimelineDraft, ...operators: readonly TimelineOperator[]): TimelineDraft {
  return operators.reduce((currentTimeline, operator) => operator(currentTimeline), timeline);
}

export function pointer(definition: TimelinePointerDefinition): TimelineOperator {
  return (timeline) => {
    timeline.pointers.set(definition.id, definition);
    ensureTrack(timeline, definition.id);

    return timeline;
  };
}

export function set(pointerId: string, point: Point): TimelineOperator {
  return (timeline) => {
    ensurePointer(timeline, pointerId);
    timeline.currentPoints.set(pointerId, point);

    return timeline;
  };
}

export function toTimelineDefinition(timeline: TimelineDraft): TimelineDefinition {
  return {
    actions: [...timeline.actions].sort((first, second) => first.atMs - second.atMs),
    durationMs: timeline.timeMs,
    pointers: [...timeline.pointers.values()],
    tracks: [...timeline.tracks.entries()].map(([pointerId, segments]) => ({
      pointerId,
      segments: [...segments]
    }))
  };
}

export function wait(durationMs: number, options: TimelineWaitOptions = {}): TimelineOperator {
  return (timeline) => {
    if (durationMs <= 0) {
      throw new Error('Timeline wait duration must be greater than 0.');
    }

    const pointerIds = options.pointerIds ?? [...timeline.currentPoints.keys()];

    for (const pointerId of pointerIds) {
      ensurePointer(timeline, pointerId);

      const point = timeline.currentPoints.get(pointerId);

      if (!point) {
        throw new Error(`Cannot wait pointer "${pointerId}" before it has been set.`);
      }

      addSegment(timeline, pointerId, {
        durationMs,
        id: options.id ? `${options.id}-${pointerId}` : nextSegmentId(timeline, 'wait'),
        path: createHoldPath(point),
        phase: options.phase,
        startMs: timeline.timeMs
      });
    }

    timeline.timeMs += durationMs;

    return timeline;
  };
}

export function createEmptyTimelineSample(phase = 'Idle'): TimelineSample {
  return {
    done: false,
    elapsedMs: 0,
    phase,
    positions: []
  };
}

function addSegment(state: TimelineDraft, pointerId: string, segment: TimelineTrackSegment): void {
  ensureTrack(state, pointerId).push(segment);
}

function createHoldPath(point: Point): CubicPath {
  return [point, point, point, point];
}

function createLinePath(from: Point, to: Point): CubicPath {
  return [from, from, to, to];
}

function ensurePointer(state: TimelineDraft, pointerId: string): void {
  if (!state.pointers.has(pointerId)) {
    throw new Error(`Unknown timeline pointer "${pointerId}". Add pointer(...) before using it.`);
  }
}

function ensureTrack(state: TimelineDraft, pointerId: string): TimelineTrackSegment[] {
  const existingTrack = state.tracks.get(pointerId);

  if (existingTrack) {
    return existingTrack;
  }

  const nextTrack: TimelineTrackSegment[] = [];

  state.tracks.set(pointerId, nextTrack);

  return nextTrack;
}

function nextSegmentId(state: TimelineDraft, prefix: string): string {
  const nextIndex = state.segmentIndex;

  state.segmentIndex += 1;

  return `${prefix}-${nextIndex}`;
}

export function createTimelinePositionMap(
  positions: readonly TimelinePosition[]
): ReadonlyMap<string, TimelinePosition> {
  return new Map(positions.map((position) => [position.pointer.id, position]));
}

export function getTimelineActionsBetween(
  timeline: TimelineDefinition,
  previousElapsedMs: number,
  elapsedMs: number
): readonly TimelineAction[] {
  return timeline.actions
    .filter((action) => action.atMs > previousElapsedMs && action.atMs <= elapsedMs)
    .sort((first, second) => first.atMs - second.atMs);
}

export function getTimelinePaths(timeline: TimelineDefinition): readonly TimelinePath[] {
  return timeline.tracks.flatMap((track) =>
    track.segments.map((segment) => ({
      d: cubicPathD(segment.path),
      id: `${track.pointerId}-${segment.id}`
    }))
  );
}

export function sampleTimeline(timeline: TimelineDefinition, elapsedMs: number): TimelineSample {
  const clampedElapsed = Math.min(Math.max(elapsedMs, 0), timeline.durationMs);
  const pointerById = new Map(timeline.pointers.map((pointer) => [pointer.id, pointer]));
  const positions = timeline.tracks.flatMap((track) => {
    const pointer = pointerById.get(track.pointerId);

    if (!pointer) {
      return [];
    }

    const sample = sampleTrack(track, clampedElapsed);

    return [
      {
        phase: sample.phase,
        point: sample.point,
        pointer
      }
    ];
  });
  const phase =
    positions.find((position) => position.phase)?.phase ?? (clampedElapsed >= timeline.durationMs ? 'Done' : 'Idle');

  return {
    done: clampedElapsed >= timeline.durationMs,
    elapsedMs: clampedElapsed,
    phase: clampedElapsed >= timeline.durationMs ? 'Done' : phase,
    positions
  };
}

function sampleTrack(track: TimelineTrack, elapsedMs: number): { readonly phase?: string; readonly point: Point } {
  const segments = [...track.segments].sort((first, second) => first.startMs - second.startMs);
  let previousSegment: TimelineTrackSegment | undefined;

  for (const segment of segments) {
    const endMs = segment.startMs + segment.durationMs;

    if (elapsedMs >= segment.startMs && elapsedMs <= endMs) {
      return {
        phase: segment.phase,
        point: pointOnCubic(segment.path, (elapsedMs - segment.startMs) / segment.durationMs)
      };
    }

    if (elapsedMs < segment.startMs) {
      const point = previousSegment ? previousSegment.path[3] : segment.path[0];

      return {
        phase: previousSegment?.phase ?? segment.phase,
        point
      };
    }

    previousSegment = segment;
  }

  const fallbackSegment = previousSegment ?? segments[0];

  return {
    phase: fallbackSegment?.phase,
    point: fallbackSegment?.path[3] ?? { x: 0, y: 0 }
  };
}
