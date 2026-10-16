import { strokePressures, type PressureStroke } from '@app-game/paint-core/pressureCurve';
import { createEventListener } from '@solid-primitives/event-listener';
import { createSignal, type Accessor } from 'solid-js';

/**
 * Collects the raw pressure of pen strokes drawn on canvases inside `target`, with every coalesced sample, for
 * fitting a pressure curve. Mouse and touch contacts are not collected; `otherPointer` names the type of the latest
 * one, so the caller can say that calibration needs a pen. `counted` is the number of samples `fitPressureCurve`
 * would count, updated when a stroke ends; `pressure` is the raw pressure of the pen touching a canvas now, for a
 * live marker, `undefined` between strokes. Listeners follow `target` and detach with the owner.
 */
export function createPenStrokes(target: Accessor<Element | undefined>) {
  let strokes: { time: number; pressure: number }[][] = [];
  let current: { id: number; samples: { time: number; pressure: number }[] } | undefined;
  const [counted, setCounted] = createSignal(0);
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
  });
  createEventListener<PointerEvents>(target, ['pointerup', 'pointercancel'], (event) => {
    if (!current || current.id !== event.pointerId) {
      return;
    }

    strokes.push(current.samples);
    current = undefined;
    setPressure(undefined);
    setCounted(strokePressures(strokes).length);
  });

  return {
    counted,
    otherPointer,
    pressure,
    /** Returns the strokes collected so far and starts collecting anew. */
    take(): PressureStroke[] {
      const taken = strokes;
      strokes = [];
      current = undefined;
      setCounted(0);
      setPressure(undefined);
      return taken;
    }
  };
}

/** The pointer events the collector listens to. */
type PointerEvents = Record<'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel', PointerEvent>;
