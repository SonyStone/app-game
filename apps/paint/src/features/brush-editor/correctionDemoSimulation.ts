import { defaultBrush, type Sample } from '@app-game/paint-core/brush';
import { studioProcessors } from '@app-game/paint-core/strokeProcessors';
import { normalizeStrokeSettings, type StrokeSettings } from '@app-game/paint-core/strokeSettings';

/** Pen contact lasts 2.5 seconds, followed by a 750 ms hold before clearing. */
export const correctionDemoTiming = { lift: 2500, loop: 3250 };

/**
 * Replays the real processor once for a settings/sample change. Stores committed-prefix lengths and
 * disposable preview tails at 120 Hz, including idle updates during the rest. Frames only slice this cache.
 * The full finished line and missing stretch are available even at the start of the loop.
 */
export function prepareStrokeCorrection(settings: StrokeSettings, samples = correctionPenSamples()) {
  const stroke = normalizeStrokeSettings(settings);
  const processor = studioProcessors[stroke.mode]({ ...defaultBrush(), size: 4, stroke }, 1);
  const committed: Sample[] = [];
  const snapshots: { time: number; count: number; rawCount: number; preview: Sample[] }[] = [];
  let rawCount = 0;
  let previousTime = 0;
  // Include packet times exactly, plus idle ticks so the resting pen continues to settle.
  const times = [
    ...new Set([
      ...samples.map((sample) => sample.time),
      ...Array.from({ length: 301 }, (_, index) => (index * 1000) / 120)
    ])
  ].sort((a, b) => a - b);
  for (const time of times) {
    if (time > correctionDemoTiming.lift) {
      break;
    }

    const sample = samples[rawCount];
    if (sample && sample.time === time) {
      committed.push(...processor.add([sample]));
      rawCount++;
    } else {
      committed.push(...(processor.idle?.(time - previousTime) ?? []));
    }

    snapshots.push({ time, count: committed.length, rawCount, preview: processor.preview() });
    previousTime = time;
  }

  const beforeLift = committed.slice();
  const afterLift = processor.finish();
  const fullLine = [...beforeLift, ...afterLift];
  const end = fullLine.at(-1);
  const lift = samples.at(-1);
  const missing = end && lift && Math.hypot(end.x - lift.x, end.y - lift.y) > 2 ? [end, lift] : [];
  return { raw: samples, fullLine, beforeLift, afterLift, missing, snapshots };
}

/** Selects a cached replay at clamped milliseconds; returns both the full result and ink drawn so far. */
export function strokeCorrectionFrame(simulation: ReturnType<typeof prepareStrokeCorrection>, time: number) {
  const lifted = time >= correctionDemoTiming.lift;
  const until = Math.max(0, Math.min(correctionDemoTiming.lift, time));
  const snapshot = simulation.snapshots.findLast((snapshot) => snapshot.time <= until);
  const rawCount = snapshot?.rawCount ?? 0;
  const line = lifted
    ? simulation.fullLine
    : [...simulation.beforeLift.slice(0, snapshot?.count ?? 0), ...(snapshot?.preview ?? [])];
  return {
    raw: simulation.raw,
    fullLine: simulation.fullLine,
    finishIndex: simulation.beforeLift.length,
    missing: simulation.missing,
    line,
    beforeLift: lifted ? simulation.beforeLift : simulation.beforeLift.slice(0, snapshot?.count ?? 0),
    afterLift: lifted ? simulation.afterLift : [],
    pen: simulation.raw[rawCount - 1],
    lifted
  };
}

/**
 * Fixed 120 Hz pen input in CSS pixels for a strip of `width` × 84, default 360.
 * Includes curves, jitter, a rest, and a 50 ms flick across the final 30% of the usable width.
 * Widths below 240 are clamped to keep the gesture and lift gap legible.
 */
export function correctionPenSamples(width = 360): Sample[] {
  const travelWidth = Math.max(240, width) - 32;
  const points: Sample[] = [];
  for (let index = 0; index <= 300; index++) {
    const time = (index * 1000) / 120;
    if (time > 1150 && time < 1350) {
      continue;
    }

    const travel = time <= 1150 ? time : Math.max(1150, time - 200);
    const t = travel / 2300;
    const progress = time <= 2450 ? 0.7 * (travel / 2250) : 0.7 + 0.3 * ((time - 2450) / 50);
    const x = 16 + travelWidth * progress;
    const y = t < 0.3 ? 42 - 23 * Math.sin((t / 0.3) * Math.PI * 2) : t < 0.4 ? 42 + ((t - 0.3) / 0.1) * 22 : 64;
    // Fade jitter out on the straight exit so the finishing distance is easy to compare.
    const jitter = t < 0.4 ? Math.sin(index * 1.7) * 1.8 : 0;
    points.push({ x, y: y + jitter, pressure: 0.35 + 0.3 * Math.sin(Math.PI * t), time, pointerType: 'pen' });
  }

  return points;
}
