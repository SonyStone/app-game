import { createEffect } from 'solid-js';
import type { Preset } from './catalog';

/**
 * A brush preset's sample stroke: an S-curve across the whole width, painted as the gallery paints (round dabs,
 * pressure tapering both ends when the preset follows pressure, softness as blur), so the sample matches the real
 * stroke. The size is scaled down to fit the height but keeps the presets' relative sizes. Sizes itself to its
 * box's CSS width and `height`; redraws when the color or the box changes.
 */
export function StrokePreview(props: {
  preset: Preset;
  color: string;
  /** CSS height in pixels; 36 by default. The width fills the parent. */
  height?: number;
  class?: string;
}) {
  let canvas!: HTMLCanvasElement;

  createEffect(
    () => ({ preset: props.preset, color: props.color, height: props.height ?? 36 }),
    ({ preset, color, height }) => {
      const frame = requestAnimationFrame(() => paint(canvas, preset, color, height));
      return () => cancelAnimationFrame(frame);
    }
  );

  return (
    <canvas
      ref={canvas}
      class={props.class}
      style={{ display: 'block', width: '100%', height: `${props.height ?? 36}px` }}
      aria-hidden="true"
    />
  );
}

function paint(canvas: HTMLCanvasElement, preset: Preset, color: string, height: number) {
  const ratio = devicePixelRatio || 1;
  const width = Math.max(40, canvas.clientWidth || 160);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const context = canvas.getContext('2d')!;
  context.scale(ratio, ratio);
  context.clearRect(0, 0, width, height);

  const size = Number(preset.values.size ?? 10);
  // Sizes map to the strip's height geometrically, so that a 3 px liner and a 140 px airbrush both read.
  const thickness = Math.min(height * 0.62, 1.2 + Math.log2(1 + size) * height * 0.075);
  const hardness = Number(preset.values.hardness ?? 100);
  const opacity = Number(preset.values.opacity ?? 100) / 100;
  const pressure = preset.values.pressureSize === true;
  const erase = preset.tool === 'eraser';

  context.globalAlpha = erase ? 0.5 : opacity;
  context.filter = hardness < 95 ? `blur(${((100 - hardness) / 100) * thickness * 0.35}px)` : 'none';
  context.strokeStyle = erase ? '#9a9a9a' : color;
  context.lineCap = 'round';
  const margin = thickness / 2 + 6;
  const steps = 48;
  let previous: { x: number; y: number } | undefined;
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    const x = margin + (width - margin * 2) * t;
    const y = height / 2 + Math.sin(t * Math.PI * 2) * (height / 2 - margin) * 0.55;
    if (previous) {
      context.lineWidth = Math.max(0.6, thickness * (pressure ? Math.sin(Math.PI * Math.min(0.97, 0.06 + t)) : 1));
      context.beginPath();
      context.moveTo(previous.x, previous.y);
      context.lineTo(x, y);
      context.stroke();
    }

    previous = { x, y };
  }

  if (erase) {
    // An eraser's sample shows the cut it makes: dashes across a grey band.
    context.filter = 'none';
    context.globalAlpha = 0.9;
    context.setLineDash([4, 4]);
    context.lineWidth = 1;
    context.strokeStyle = '#d0d0d0';
    context.strokeRect(margin, height / 2 - thickness / 2, width - margin * 2, thickness);
  }
}
