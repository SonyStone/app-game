import { strokePressures, type PressureStroke } from '@app-game/paint-core/pressureCurve';
import { createEventListener } from '@solid-primitives/event-listener';
import { createMemo, createSignal, type Accessor } from 'solid-js';

/**
 * Collects the raw pressure of pen strokes drawn on canvases inside `target`, with every coalesced sample, for
 * fitting a pressure curve. Mouse and touch contacts are not collected; `otherPointer` names the type of the latest
 * one, so the caller can show that calibration needs a pen. `pressures` are the raw pressures `fitPressureCurve`
 * would count from the strokes collected so far (sorted, stroke ends left out; see `strokePressures`) and `counted`
 * their number, both updated when a stroke ends; `drawing` holds the raw pressures of the stroke in progress, updated
 * with every move, for a histogram that fills as the pen draws. `pressure` is the raw pressure of the pen touching a
 * canvas now, for a live marker, `undefined` between strokes. `onStroke` receives each pen stroke as it ends, for a
 * host that keeps them itself. Listeners follow `target` and detach with the owner.
 */
export function createPenStrokes(target: Accessor<Element | undefined>, onStroke?: (stroke: PressureStroke) => void) {
  let strokes: { time: number; pressure: number }[][] = [];
  let current: { id: number; samples: { time: number; pressure: number }[] } | undefined;
  const [pressures, setPressures] = createSignal<readonly number[]>([]);
  const [drawing, setDrawing] = createSignal<readonly number[]>([]);
  const counted = createMemo(() => pressures().length);
  const [otherPointer, setOtherPointer] = createSignal<string>();
  const [pressure, setPressure] = createSignal<number>();

  createEventListener<PointerEvents>(target, 'pointerdown', (event) => {
    if (!(event.target instanceof HTMLCanvasElement) || current) {
      return;
    }

    if (event.pointerType !== 'pen') {
      setOtherPointer(event.pointerType);
      return;
    }

    setOtherPointer(undefined);
    setPressure(event.pressure);
    current = { id: event.pointerId, samples: [{ time: event.timeStamp, pressure: event.pressure }] };
    setDrawing([event.pressure]);
  });
  createEventListener<PointerEvents>(target, 'pointermove', (event) => {
    if (!current || current.id !== event.pointerId) {
      return;
    }

    const { samples } = current;
    const coalesced = event.getCoalescedEvents?.() ?? [];
    for (const sample of coalesced.length ? coalesced : [event]) {
      if (sample.buttons & 1) {
        samples.push({ time: sample.timeStamp, pressure: sample.pressure });
      }
    }

    setPressure(samples.at(-1)!.pressure);
    setDrawing(samples.map((sample) => sample.pressure));
  });
  createEventListener<PointerEvents>(target, ['pointerup', 'pointercancel'], (event) => {
    if (!current || current.id !== event.pointerId) {
      return;
    }

    const finished = current.samples;
    strokes.push(finished);
    current = undefined;
    onStroke?.(finished);
    setPressure(undefined);
    setDrawing([]);
    setPressures(strokePressures(strokes));
  });

  return {
    counted,
    pressures,
    drawing,
    otherPointer,
    pressure,
    /** Returns the strokes collected so far and starts collecting anew. */
    take(): PressureStroke[] {
      const taken = strokes;
      strokes = [];
      current = undefined;
      setPressures([]);
      setDrawing([]);
      setPressure(undefined);
      return taken;
    }
  };
}

/** The pointer events the collector listens to. */
type PointerEvents = Record<'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel', PointerEvent>;
