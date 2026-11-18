import { defaultBrush, type Sample } from '@app-game/paint-core/brush';
import { studioProcessors } from '@app-game/paint-core/strokeProcessors';
import { normalizeStrokeSettings, type StrokeSettings } from '@app-game/paint-core/strokeSettings';

/** Pen contact lasts 2.5 seconds, followed by a 750 ms hold before clearing. */
export const correctionDemoTiming = { lift: 2500, loop: 3250 };

/**
 * Replays pen packets and a short mid-gesture rest through Paint's real processor. Coordinates are CSS pixels
 * in the supplied samples, by default a 360 × 84 strip. Time is milliseconds, clamped, not wrapped.
 * `lifted` means time has reached pen-up at 2500 ms. `beforeLift` is committed ink before finish,
 * excluding disposable preview tails; `afterLift` is the output added by finish, empty while drawing.
 * `line` joins those arrays after lift, or committed ink and a disposable preview during contact.
 * `pen` is the latest raw sample and remains at the lift point in a finished still.
 * Preview tails are disposable and never become committed points.
 */
export function strokeCorrectionFrame(settings: StrokeSettings, time: number, samples = correctionPenSamples()) {
  const stroke = normalizeStrokeSettings(settings);
  const processor = studioProcessors[stroke.mode]({ ...defaultBrush(), size: 4, stroke }, 1);
  const committed: Sample[] = [];
  const raw: Sample[] = [];
  const until = Math.max(0, Math.min(correctionDemoTiming.lift, time));
  let previousTime = 0;
  for (const sample of samples) {
    if (sample.time > until) {
      break;
    }

    // No packets during the rest: use the engine's idle clock instead.
    if (sample.time - previousTime > 20) {
      committed.push(...(processor.idle?.(sample.time - previousTime) ?? []));
    }

    committed.push(...processor.add([sample]));
    raw.push(sample);
    previousTime = sample.time;
  }

  if (until > previousTime) {
    committed.push(...(processor.idle?.(until - previousTime) ?? []));
  }

  const lifted = time >= correctionDemoTiming.lift;
  const afterLift = lifted ? processor.finish() : [];
  const line = [...committed, ...(lifted ? afterLift : processor.preview())];
  return { raw, line, beforeLift: committed, afterLift, pen: raw.at(-1), lifted };
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

/** Plain-language description of the selected processor and its lift behavior. */
export function correctionDemoCaption(settings: StrokeSettings) {
  switch (settings.mode) {
    case 'none':
      return 'The dot is your pen. The line follows every movement.';
    case 'studio':
      return 'The dot is your pen. The line rounds small movements and follows it to the end.';
    case 'normal':
      return 'The dot is your pen. The line smooths movements and finishes where you lift.';
    case 'smooth':
      return settings.catchUp
        ? 'The ring is where you lift. Blue ink catches up after the pen lifts.'
        : 'The ring is where you lift. The line stops short; dashes show the missing end.';
    case 'stabilizer':
      return 'The dot is your pen. Higher levels trail farther; blue ink finishes the line after lift.';
  }
}
