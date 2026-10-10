import type { Brush } from '@app-game/paint-core/brush';
import { createEffect } from 'solid-js';

/**
 * A brush preset's sample stroke for the brush list, after the Procreate variant's: an S-curve
 * across the width, in light grey. Its thickness grows with the preset's size (geometrically, so a 2 px liner and a
 * 300 px airbrush both read), tapers at both ends when size follows pressure, blurs for soft tips and fades with the
 * preset's opacity. Imported ABR tips are drawn as their spaced dabs, since their tip images are not loaded here.
 * Fills its parent's width at `height` CSS pixels; redraws when the settings change.
 */
export function StrokePreview(props: { settings: Partial<Brush>; height: number }) {
  let canvas!: HTMLCanvasElement;

  createEffect(
    () => ({ settings: props.settings, height: props.height }),
    ({ settings, height }) => {
      const frame = requestAnimationFrame(() => paint(canvas, settings, height));
      return () => cancelAnimationFrame(frame);
    }
  );

  return (
    <canvas ref={canvas} style={{ display: 'block', width: '100%', height: `${props.height}px` }} aria-hidden="true" />
  );
}

function paint(canvas: HTMLCanvasElement, settings: Partial<Brush>, height: number) {
  const ratio = devicePixelRatio || 1;
  const width = Math.max(40, canvas.clientWidth || 160);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const context = canvas.getContext('2d')!;
  context.scale(ratio, ratio);

  const size = settings.size ?? 32;
  const thickness = Math.min(height * 0.6, 1.4 + Math.log2(1 + size) * height * 0.07);
  const hardness = settings.hardness ?? 1;
  const erase = settings.tool === 'eraser';
  const dabs = settings.engine?.id === 'abr';
  const margin = thickness / 2 + 6;
  const point = (t: number) => ({
    x: margin + (width - margin * 2) * t,
    y: height / 2 + Math.sin(t * Math.PI * 2) * (height / 2 - margin) * 0.5
  });
  const taper = (t: number) => (settings.pressureSize === false ? 1 : Math.sin(Math.PI * Math.min(0.97, 0.05 + t)));

  context.globalAlpha = erase ? 0.55 : Math.max(0.25, settings.opacity ?? 1);
  context.filter = hardness < 0.9 ? `blur(${(1 - hardness) * thickness * 0.3}px)` : 'none';
  context.strokeStyle = context.fillStyle = '#e6e6e6';
  context.lineCap = 'round';
  if (dabs) {
    // Spaced dabs suggest a stamped tip.
    const step = Math.max(3, thickness * Math.max(0.35, settings.spacing ?? 0.25));
    for (let x = 0; x <= width - margin * 2; x += step) {
      const t = x / (width - margin * 2);
      const { x: px, y } = point(t);
      context.beginPath();
      context.arc(px, y, Math.max(0.6, (thickness / 2) * taper(t)), 0, Math.PI * 2);
      context.fill();
    }

    return;
  }

  const steps = 48;
  let previous = point(0);
  for (let step = 1; step <= steps; step++) {
    const t = step / steps;
    const next = point(t);
    context.lineWidth = Math.max(0.6, thickness * taper(t));
    context.beginPath();
    context.moveTo(previous.x, previous.y);
    context.lineTo(next.x, next.y);
    context.stroke();
    previous = next;
  }
}
