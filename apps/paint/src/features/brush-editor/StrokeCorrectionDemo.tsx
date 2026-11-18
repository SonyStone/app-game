import type { Brush } from '@app-game/paint-core/brush';
import { createEventListener } from '@solid-primitives/event-listener';
import { createVisibilityObserver } from '@solid-primitives/intersection-observer';
import { createMediaQuery } from '@solid-primitives/media';
import { createEffect, createMemo, createSignal } from 'solid-js';
import { correctionDemoCaption, correctionDemoTiming, strokeCorrectionFrame } from './correctionDemoSimulation';
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
  const settings = createMemo(() => ({ ...props.brush.stroke }));

  createEffect(
    () => ({ canvas: canvas(), settings: settings(), active: visible() && !hidden(), reduced: reduced() }),
    ({ canvas, settings, active, reduced }) => {
      if (!canvas) {
        return;
      }

      let request = 0;
      const start = performance.now();
      const draw = (now: number) => {
        const time = reduced ? correctionDemoTiming.lift : (now - start) % correctionDemoTiming.loop;
        const frame = strokeCorrectionFrame(settings, time);
        drawFrame(canvas, frame);
        canvas.dataset.phase = frame.lifted ? 'lifted' : 'drawing';
        canvas.dataset.time = String(Math.round(time));
        if (active && !reduced) {
          request = requestAnimationFrame(draw);
        }
      };
      draw(start);
      return () => cancelAnimationFrame(request);
    }
  );

  return (
    <figure class={styles.demo}>
      <canvas ref={setCanvas} class={styles.canvas} role="img" aria-label="Stroke correction demonstration" />
      <figcaption class={styles.caption}>{correctionDemoCaption(settings())}</figcaption>
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

  context.scale((ratio * width) / 360, ratio);
  context.strokeStyle = getComputedStyle(canvas).color;
  context.fillStyle = context.strokeStyle;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.globalAlpha = 0.22;
  context.lineWidth = 1;
  context.beginPath();
  frame.raw.forEach((point, index) => (index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y)));
  context.stroke();
  context.globalAlpha = 0.9;
  frame.line.forEach((point, index) => {
    const previous = frame.line[index - 1] ?? point;
    context.lineWidth = Math.max(0.2, (previous.pressure + point.pressure) * 2.5);
    context.beginPath();
    context.moveTo(previous.x, previous.y);
    context.lineTo(point.x, point.y);
    context.stroke();
  });
  if (frame.pen) {
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
}
