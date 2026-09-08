import type { BrushTipImage } from '@app-game/abr-parser/reader';
import type { BrushFormValues } from './form';
import { usesPencilCoverage } from './pencil';
import { generateComputedBrushTip } from './stroke';

/** A deterministic 2D preview for physical tips; does not emulate Photoshop's proprietary bristle solver. */
export function generatePhysicalTip(values: BrushFormValues): BrushTipImage {
  const size = 128,
    data = new Uint8Array(size * size);
  if (values.tipKind === 'dBrush') {
    const b = values.bristle,
      count = Math.max(1, Math.round(b.density * 2));
    let seed = 1241;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2,
        r = Math.sqrt(random()) * size * 0.42;
      const flat = b.shape >= 5;
      let x = size / 2 + (flat ? (random() - 0.5) * size * 0.9 : Math.cos(angle) * r);
      let y = size / 2 + (flat ? (random() - 0.5) * size * 0.15 : Math.sin(angle) * r);
      const profile = b.shape % 5;
      if (profile === 0) {
        x = size / 2 + (x - size / 2) * 0.65;
        y = size / 2 + (y - size / 2) * 0.65;
      }
      if (profile === 2) y += ((x - size / 2) ** 2 / size) * 0.4;
      if (profile === 3) y += (x - size / 2) * 0.4;
      if (profile === 4) {
        x = size / 2 + (x - size / 2) * 1.15;
        y += Math.abs(x - size / 2) * 0.35;
      }
      const radius = 0.3 + b.thickness * 0.07;
      const length = radius + (b.physics ? (1 - b.stiffness / 100) * b.length * 0.12 : 0);
      const cluster = 1 + b.clumping / 100;
      for (let py = Math.max(0, Math.floor(y - length)); py < Math.min(size, y + length + 1); py++)
        for (
          let px = Math.max(0, Math.floor(x - radius * cluster));
          px < Math.min(size, x + radius * cluster + 1);
          px++
        ) {
          const distance = Math.hypot((px - x) / (radius * cluster), (py - y) / length);
          const alpha = Math.max(0, 1 - distance);
          data[py * size + px] = Math.min(255, data[py * size + px]! + alpha * 255);
        }
    }
  } else if (values.tipVariant !== 0) {
    const e = values.erodible;
    let seed = 7349;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < e.splatCount; i++) {
      const angle = random() * Math.PI * 2;
      const spread = Math.sqrt(random()) * size * 0.45 * Math.max(0.02, Math.sin((e.cutoff * Math.PI) / 180));
      const x = size / 2 + Math.cos(angle) * spread,
        y = size / 2 + Math.sin(angle) * spread;
      const radius = 0.2 + e.splatSize * 0.04 * (1 + (random() * e.granularity) / 100);
      const stretch = radius * (1 + e.streakiness / 25);
      for (let py = Math.max(0, Math.floor(y - stretch)); py < Math.min(size, y + stretch + 1); py++)
        for (let px = Math.max(0, Math.floor(x - radius)); px < Math.min(size, x + radius + 1); px++) {
          const alpha = Math.max(0, 1 - Math.hypot((px - x) / radius, (py - y) / stretch));
          data[py * size + px] = Math.min(255, data[py * size + px]! + alpha * 255);
        }
    }
  } else {
    const e = values.erodible;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const dx = (x + 0.5 - size / 2) / (size * 0.45),
          dy = (y + 0.5 - size / 2) / (size * 0.45 * Math.max(0.05, e.length / 100));
        let radius = Math.hypot(dx, dy);
        if (e.shape === 0) radius = Math.pow(radius, 0.65);
        if (e.shape === 1) radius = Math.max(Math.abs(dx), Math.abs(dy) * 3);
        else if (e.shape === 3) radius = Math.max(Math.abs(dx), Math.abs(dy));
        else if (e.shape === 4) radius = Math.max(Math.abs(dx) * 1.3 + dy * 0.5, -dy);
        const edge = Math.max(0.01, e.softness / 100);
        data[y * size + x] = Math.round(255 * Math.max(0, Math.min(1, (1 - radius) / edge)));
      }
  }
  return { width: size, height: size, depth: 8, data };
}
/** Selects a generated preview for non-sampled tips. */
export function generatePreviewTip(values: BrushFormValues) {
  return values.tipKind === 'dBrush' || values.tipKind === 'dTips'
    ? generatePhysicalTip(values)
    : generateComputedBrushTip(128, usesPencilCoverage(values.tool) ? 100 : values.hardness);
}
