/**
 * A recorded editor session, saved as `recording.json` next to the files it names. Events copy the browser's values
 * at dispatch time, in viewport CSS pixels, so a replay at the same viewport size can dispatch them again.
 */
export type InputRecording = {
  /** Format version; readers reject versions they do not know. */
  version: typeof recordingVersion;
  /** Directory name under `apps/paint/recordings`, also used in the file names. */
  id: string;
  /** Wall-clock start, ISO 8601. */
  startedAt: string;
  /** Milliseconds from the start to the last event or to stopping, whichever is later. */
  duration: number;
  /** What the user says happened; empty when they left no note. */
  note: string;
  /** The build that recorded, as embedded by Vite; absent outside the standalone app. */
  build?: unknown;
  environment: RecordingEnvironment;
  /** Editor state observed at the start; `state` events later report changed keys only. */
  initial: Record<string, unknown>;
  /** Files saved next to `recording.json`; absent when the engine could not export them. */
  files: { document?: string; startView?: string; endView?: string };
  /**
   * Recorded events in dispatch order. Input events carry the browser's event timestamp, which can precede the
   * dispatch of the event and of commands recorded just before it by a few milliseconds.
   */
  events: RecordedEvent[];
};

/** Recordings with another version have an incompatible layout. */
export const recordingVersion = 1;

/** Viewport and device properties that affect input handling and layout. */
export type RecordingEnvironment = {
  userAgent: string;
  viewport: { width: number; height: number };
  devicePixelRatio: number;
  maxTouchPoints: number;
  /** The browser offers `pointerrawupdate` events. */
  rawPointerUpdates: boolean;
};

/** Reads the current viewport and device properties. */
export function readEnvironment(): RecordingEnvironment {
  return {
    userAgent: navigator.userAgent,
    viewport: { width: innerWidth, height: innerHeight },
    devicePixelRatio: devicePixelRatio,
    maxTouchPoints: navigator.maxTouchPoints,
    rawPointerUpdates: 'onpointerrawupdate' in window
  };
}

/** One entry of a recording; `time` is in milliseconds since the recording started. */
export type RecordedEvent =
  | RecordedPointer
  | RecordedKey
  | RecordedWheel
  | { time: number; kind: 'viewport'; width: number; height: number; devicePixelRatio: number }
  | { time: number; kind: 'visibility'; state: DocumentVisibilityState }
  | { time: number; kind: 'focus'; type: 'blur' | 'focus' }
  /** A document command sent by the editor, abbreviated by `abbreviate`. */
  | { time: number; kind: 'command'; command: unknown }
  /** Observed editor state keys whose values changed. */
  | { time: number; kind: 'state'; changes: Record<string, unknown> };

/** Pointer events the recorder copies; `pointerrawupdate` is only dispatched for pens in secure contexts. */
export const recordedPointerTypes = [
  'pointerdown',
  'pointermove',
  'pointerrawupdate',
  'pointerup',
  'pointercancel',
  'gotpointercapture',
  'lostpointercapture'
] as const;

/**
 * A pointer event with every measurement Chromium reports. Modifier flags appear only when pressed. `coalesced` lists
 * the samples merged into a move, when there was more than one; their `time` uses the same clock.
 */
export type RecordedPointer = PointerMeasurements & {
  time: number;
  kind: 'pointer';
  type: (typeof recordedPointerTypes)[number];
  pointerId: number;
  pointerType: string;
  isPrimary: boolean;
  button: number;
  /** The element under the pointer, described by `describeTarget`; recorded for contacts and captures only. */
  target?: string;
  coalesced?: (PointerMeasurements & { time: number })[];
} & Modifiers;

/** Position and pen or touch measurements shared by events and coalesced samples. */
type PointerMeasurements = Pick<
  PointerEvent,
  | 'clientX'
  | 'clientY'
  | 'buttons'
  | 'pressure'
  | 'tangentialPressure'
  | 'tiltX'
  | 'tiltY'
  | 'twist'
  | 'altitudeAngle'
  | 'azimuthAngle'
  | 'width'
  | 'height'
>;

/** Pressed modifier keys; released ones are omitted to keep recordings small. */
type Modifiers = { altKey?: true; ctrlKey?: true; metaKey?: true; shiftKey?: true };

/**
 * Copies a pointer event. `time` converts an event timestamp to recording time. Coalesced samples are kept for moves
 * and raw updates; contact and capture events also describe their target.
 */
export function readPointer(event: PointerEvent, time: (timeStamp: number) => number): RecordedPointer {
  const type = event.type as RecordedPointer['type'];
  const recorded: RecordedPointer = {
    time: time(event.timeStamp),
    kind: 'pointer',
    type,
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    isPrimary: event.isPrimary,
    button: event.button,
    ...readMeasurements(event),
    ...readModifiers(event)
  };

  if (type === 'pointermove' || type === 'pointerrawupdate') {
    const coalesced = event.getCoalescedEvents?.() ?? [];
    if (coalesced.length > 1) {
      recorded.coalesced = coalesced.map((sample) => ({ time: time(sample.timeStamp), ...readMeasurements(sample) }));
    }
  } else {
    recorded.target = describeTarget(event.target);
  }

  return recorded;
}

function readMeasurements(event: PointerEvent): PointerMeasurements {
  return {
    clientX: event.clientX,
    clientY: event.clientY,
    buttons: event.buttons,
    pressure: event.pressure,
    tangentialPressure: event.tangentialPressure,
    tiltX: event.tiltX,
    tiltY: event.tiltY,
    twist: event.twist,
    altitudeAngle: event.altitudeAngle,
    azimuthAngle: event.azimuthAngle,
    width: event.width,
    height: event.height
  };
}

function readModifiers(event: KeyboardEvent | MouseEvent): Modifiers {
  const modifiers: Modifiers = {};

  for (const key of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey'] as const) {
    if (event[key]) {
      modifiers[key] = true;
    }
  }

  return modifiers;
}

/** A key press or release, with the focused element it was dispatched to. */
export type RecordedKey = {
  time: number;
  kind: 'key';
  type: 'keydown' | 'keyup';
  key: string;
  code: string;
  repeat: boolean;
  target: string;
} & Modifiers;

/** Copies a keyboard event; see `readPointer` for `time`. */
export function readKey(event: KeyboardEvent, time: (timeStamp: number) => number): RecordedKey {
  return {
    time: time(event.timeStamp),
    kind: 'key',
    type: event.type as RecordedKey['type'],
    key: event.key,
    code: event.code,
    repeat: event.repeat,
    target: describeTarget(event.target),
    ...readModifiers(event)
  };
}

/** A wheel or trackpad scroll; pinch zoom on a trackpad arrives as a wheel event with `ctrlKey`. */
export type RecordedWheel = {
  time: number;
  kind: 'wheel';
  clientX: number;
  clientY: number;
  deltaX: number;
  deltaY: number;
  deltaZ: number;
  deltaMode: number;
  target: string;
} & Modifiers;

/** Copies a wheel event; see `readPointer` for `time`. */
export function readWheel(event: WheelEvent, time: (timeStamp: number) => number): RecordedWheel {
  return {
    time: time(event.timeStamp),
    kind: 'wheel',
    clientX: event.clientX,
    clientY: event.clientY,
    deltaX: event.deltaX,
    deltaY: event.deltaY,
    deltaZ: event.deltaZ,
    deltaMode: event.deltaMode,
    target: describeTarget(event.target),
    ...readModifiers(event)
  };
}

/**
 * Names an element for a reader of the recording, such as `button[aria-label="Undo"]` or
 * `div.handle in [aria-label="Drawing workspace"]`: the element itself, followed by its nearest labelled ancestor
 * when the element has no label of its own.
 */
export function describeTarget(target: EventTarget | null): string {
  if (!(target instanceof Element)) {
    return target === window ? 'window' : target === document ? 'document' : 'none';
  }

  const self = describeElement(target);
  if (label(target)) {
    return self;
  }

  const labelled = target.parentElement?.closest('[aria-label], [title], [role], [id]');
  return labelled ? `${self} in ${describeElement(labelled)}` : self;
}

function describeElement(element: Element) {
  const id = element.id ? `#${element.id}` : '';
  const className = typeof element.className === 'string' ? element.className.trim().split(/\s+/)[0] : '';
  const name = label(element);
  return `${element.localName}${id}${className ? `.${className}` : ''}${name ? `[${name}]` : ''}`;
}

function label(element: Element) {
  for (const attribute of ['aria-label', 'title', 'role']) {
    const value = element.getAttribute(attribute);
    if (value) {
      return `${attribute}="${value.length > labelLimit ? `${value.slice(0, labelLimit)}…` : value}"`;
    }
  }

  return '';
}

/**
 * Shortens a command for the timeline: arrays longer than `arrayLimit` keep their length and both ends, long
 * strings are cut, nesting below `depth` levels becomes `"…"`, and binary data keeps only its size. The result is
 * plain JSON.
 */
export function abbreviate(value: unknown, depth = 4): unknown {
  if (typeof value === 'string') {
    return value.length > stringLimit ? `${value.slice(0, stringLimit)}…` : value;
  }

  if (typeof value !== 'object' || value === null) {
    return typeof value === 'number' && !Number.isFinite(value) ? String(value) : value;
  }

  if (value instanceof Blob) {
    return { blob: value.type, size: value.size };
  }

  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    return { bytes: value.byteLength };
  }

  if (typeof HTMLCanvasElement !== 'undefined' && value instanceof HTMLCanvasElement) {
    return { canvas: `${value.width}×${value.height}` };
  }

  if (typeof OffscreenCanvas !== 'undefined' && value instanceof OffscreenCanvas) {
    return { canvas: `${value.width}×${value.height}` };
  }

  if (depth === 0) {
    return '…';
  }

  if (Array.isArray(value)) {
    if (value.length <= arrayLimit) {
      return value.map((item) => abbreviate(item, depth - 1));
    }

    return { length: value.length, first: abbreviate(value[0], depth - 1), last: abbreviate(value.at(-1), depth - 1) };
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined && typeof item !== 'function')
      .map(([key, item]) => [key, abbreviate(item, depth - 1)])
  );
}

/** Labels longer than this are cut in target descriptions. */
const labelLimit = 40;

/** Arrays up to this length are recorded in full. */
const arrayLimit = 8;

/** Strings longer than this are cut. */
const stringLimit = 200;
