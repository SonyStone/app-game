import type { Brush } from '@app-game/paint-core/brush';
import { createEventListener } from '@solid-primitives/event-listener';
import { createVisibilityObserver } from '@solid-primitives/intersection-observer';
import { createMediaQuery } from '@solid-primitives/media';
import { createElementSize } from '@solid-primitives/resize-observer';
import { createEffect, createMemo, createSignal } from 'solid-js';
import {
  correctionDemoTiming,
  correctionPenSamples,
  prepareStrokeCorrection,
  strokeCorrectionFrame
} from './correctionDemoSimulation';
import styles from './StrokeCorrectionDemo.module.css';

/** A looping processor demonstration. Offscreen/hidden demos release their frame clock; reduced motion holds a still. */
export function StrokeCorrectionDemo(props: { brush: Brush }) {
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement>();
  const visible =
    typeof IntersectionObserver === 'undefined'
      ? () => false
      : createVisibilityObserver(canvas, { initialValue: false });
  const reduced =
    typeof window.matchMedia === 'undefined' ? () => true : createMediaQuery('(prefers-reduced-motion: reduce)');
  const [hidden, setHidden] = createSignal(document.hidden);
  createEventListener(document, 'visibilitychange', () => setHidden(document.hidden));
  const size = typeof ResizeObserver === 'undefined' ? { width: 360 } : createElementSize(canvas);
  const samples = createMemo(() => correctionPenSamples(size.width || 360));
  const simulation = createMemo(() => prepareStrokeCorrection({ ...props.brush.stroke }, samples()));
  const [elapsed, setElapsed] = createSignal(0);
  let pausedAt = 0;

  // Settings invalidate only the replay, leaving the running frame clock alone.
  createEffect(
    () => visible() && !hidden() && !reduced(),
    (active) => {
      if (!active) {
        return;
      }

      const start = performance.now();
      const offset = pausedAt;
      let request = 0;
      const tick = (now: number) => {
        pausedAt = offset + now - start;
        setElapsed(pausedAt);
        request = requestAnimationFrame(tick);
      };
      request = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(request);
    }
  );

  createEffect(
    () => ({
      canvas: canvas(),
      frame: strokeCorrectionFrame(
        simulation(),
        reduced() ? correctionDemoTiming.lift : elapsed() % correctionDemoTiming.loop
      ),
      time: reduced() ? correctionDemoTiming.lift : elapsed() % correctionDemoTiming.loop
    }),
    ({ canvas, frame, time }) => {
      if (!canvas) {
        return;
      }

      drawFrame(canvas, frame);
      canvas.dataset.phase = frame.lifted ? 'lifted' : 'drawing';
      canvas.dataset.time = String(Math.round(time));
    }
  );

  return (
    <figure class={styles.demo}>
      <canvas ref={setCanvas} class={styles.canvas} role="img" aria-label="Stroke correction demonstration" />
    </figure>
  );
}

/** Renders in CSS-pixel coordinates at device resolution, preserving pressure as line width. */
function drawFrame(canvas: HTMLCanvasElement, frame: ReturnType<typeof strokeCorrectionFrame>) {
  const width = canvas.clientWidth || 360;
  const height = 84;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  context.scale(ratio, ratio);
  const style = getComputedStyle(canvas);
  const ink = style.color;
  const accent = style.getPropertyValue('--studio-accent').trim() || '#2878dc';
  context.strokeStyle = ink;
  context.fillStyle = context.strokeStyle;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  // The quiet full result is painted opaque on the cleared canvas and then faded as one layer: its short segments
  // overlap, so painting each of them translucent would add up to a nearly opaque line.
  drawLine(frame.fullLine, 1, frame.finishIndex);
  context.globalCompositeOperation = 'destination-in';
  context.globalAlpha = 0.3;
  context.fillRect(0, 0, width, height);
  context.globalCompositeOperation = 'source-over';
  context.strokeStyle = ink;
  context.globalAlpha = 0.22;
  context.lineWidth = 1;
  context.beginPath();
  frame.raw.forEach((point, index) => (index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y)));
  context.stroke();
  const end = frame.missing[0];
  const lift = frame.missing[1];
  if (end && lift) {
    context.strokeStyle = ink;
    context.globalAlpha = 0.4;
    context.lineWidth = 1.5;
    context.setLineDash([5, 5]);
    context.beginPath();
    context.moveTo(end.x, end.y);
    context.lineTo(lift.x, lift.y);
    context.stroke();
    context.setLineDash([]);
  }

  drawLine(frame.line, 0.9, frame.lifted ? frame.beforeLift.length : Infinity);

  if (frame.pen) {
    context.strokeStyle = ink;
    context.globalAlpha = 1;
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(frame.pen.x, frame.pen.y, frame.lifted ? 4 : 3.5, 0, Math.PI * 2);
    if (frame.lifted) {
      context.stroke();
    } else {
      context.fill();
    }
  }

  /** Paints pressure-width segments with lift additions in the accent colour. */
  function drawLine(line: typeof frame.line, alpha: number, finishIndex: number) {
    context!.globalAlpha = alpha;
    line.forEach((point, index) => {
      const previous = line[index - 1] ?? point;
      context!.strokeStyle = index >= finishIndex ? accent : ink;
      context!.lineWidth = Math.max(0.2, (previous.pressure + point.pressure) * 2.5);
      context!.beginPath();
      context!.moveTo(previous.x, previous.y);
      context!.lineTo(point.x, point.y);
      context!.stroke();
    });
  }
}
