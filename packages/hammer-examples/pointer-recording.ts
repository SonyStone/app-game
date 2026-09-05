/** A bounded recording keeps browser timestamps and all reported pointer measurements. */
export function createRecording(width: number, height: number, startedAt: number) {
  const samples: PointerSample[] = [];
  return {
    width,
    height,
    samples,
    duration: 0,
    /** Reject samples outside the recording window, including older coalesced input. */
    append(sample: PointerSample) {
      const time = sample.timeStamp - startedAt;
      if (time < 0 || time > MAX_RECORDING_MS) return;
      samples.push({ ...sample, time });
    },
    /** Stable ordering preserves simultaneous input and sorts delayed coalesced samples. */
    finish(now: number) {
      this.duration = Math.min(MAX_RECORDING_MS, Math.max(0, now - startedAt));
      samples.sort((a, b) => a.time - b.time);
      return this;
    }
  };
}

/** One recording uses a fixed coordinate system, fitted uniformly when the window changes. */
export type PointerRecording = ReturnType<typeof createRecording>;

/** Maximum length of one take, in milliseconds. */
export const MAX_RECORDING_MS = 60_000;

/** Copy values immediately; native event objects are never retained or re-dispatched. */
export function readPointerSample(event: PointerEvent, bounds: DOMRect, time: number): PointerSample {
  return {
    type: event.type,
    time,
    timeStamp: event.timeStamp,
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    isPrimary: event.isPrimary,
    pressure: event.pressure,
    tangentialPressure: event.tangentialPressure,
    tiltX: event.tiltX,
    tiltY: event.tiltY,
    twist: event.twist,
    altitudeAngle: event.altitudeAngle,
    azimuthAngle: event.azimuthAngle,
    width: event.width,
    height: event.height,
    button: event.button,
    buttons: event.buttons
  };
}

/** Local CSS coordinates and timeline time accompany unmodified browser measurements. */
export type PointerSample = Pick<
  PointerEvent,
  | 'type'
  | 'timeStamp'
  | 'pointerId'
  | 'pointerType'
  | 'isPrimary'
  | 'pressure'
  | 'tangentialPressure'
  | 'tiltX'
  | 'tiltY'
  | 'twist'
  | 'altitudeAngle'
  | 'azimuthAngle'
  | 'width'
  | 'height'
  | 'button'
  | 'buttons'
> & {
  /** Horizontal position in the take's fixed CSS-pixel coordinate system. */
  x: number;
  /** Vertical position in the take's fixed CSS-pixel coordinate system. */
  y: number;
  /** Milliseconds since the live session or recording began. */
  time: number;
};

/** Apply the same state transitions during live input, playback and seeking. */
export function applyPointerSample(pointers: Map<number, VirtualPointer>, sample: PointerSample) {
  const previous = pointers.get(sample.pointerId);
  const ended = sample.type === 'pointerup' || sample.type === 'pointercancel' || sample.type === 'lostpointercapture';
  const down = !ended && (sample.type === 'pointerdown' || sample.buttons !== 0);
  const changed = down !== (previous?.down ?? false);
  const leaving = sample.type === 'pointerleave' || sample.type === 'pointercancel';
  const entering = sample.type === 'pointerenter' || sample.type === 'pointerdown' || sample.type === 'pointermove';
  const pointer: VirtualPointer = {
    sample,
    down,
    inside: leaving ? down : entering ? true : (previous?.inside ?? true),
    changedAt: changed ? sample.time : (previous?.changedAt ?? sample.time),
    revealFrom: changed ? (previous ? stylusReveal(previous, sample.time) : 0) : (previous?.revealFrom ?? 0),
    // Hover values must not rotate the disappearing body after contact ends.
    pose: down ? sample : (previous?.pose ?? sample)
  };
  pointers.set(sample.pointerId, pointer);
  return { previous, pointer };
}

/** Rendering state retains the last contact pose and a reversible reveal transition. */
export type VirtualPointer = {
  /** Latest reported measurements, including hover values. */
  sample: PointerSample;
  /** Last contact measurements, retained while the body disappears. */
  pose: PointerSample;
  /** Whether the pointer currently has an active press. */
  down: boolean;
  /** Whether the pointer is on the surface or still captured during a press. */
  inside: boolean;
  /** Timeline time of the last change in contact state. */
  changedAt: number;
  /** Reveal fraction at that transition, allowing uninterrupted reversals. */
  revealFrom: number;
};

/** Timeline-based animation freezes on pause and reconstructs exactly after a seek. */
export function stylusReveal(pointer: VirtualPointer, time: number) {
  const progress = Math.min(1, Math.max(0, (time - pointer.changedAt) / (pointer.down ? 260 : 180)));
  const eased = progress * progress * (3 - 2 * progress);
  return pointer.revealFrom + ((pointer.down ? 1 : 0) - pointer.revealFrom) * eased;
}

/** Incremental playback consumes every sample; backward seeks rebuild through the same sink. */
export function createPlayback(
  recording: PointerRecording,
  sink: { reset(): void; apply(sample: PointerSample): void }
) {
  let index = 0;
  let position = -1;
  return {
    seek(time: number) {
      const target = Math.min(recording.duration, Math.max(0, time));
      if (position < 0 || target < position) {
        index = 0;
        sink.reset();
      }
      while (index < recording.samples.length) {
        const sample = recording.samples[index];
        if (!sample || sample.time > target) break;
        sink.apply(sample);
        index++;
      }
      position = target;
      return target;
    }
  };
}
