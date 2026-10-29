import type { PsdLayerDetail } from './viewer';

/** Bounded pointwise adjustment operands. Unknown or changed facade serializations refuse admission. */
export type GpuAdjustment = { kind: 'lookup'; values: number[] } | { kind: 'threshold'; level: number };

/** Integer psd-rs adjust.rs tables; Levels with nonidentity gamma and modern brightness stay on the CPU. */
export function gpuAdjustment(detail: PsdLayerDetail): GpuAdjustment | undefined {
  const adjustment = detail.adjustment;
  if (!adjustment?.supported) {
    return undefined;
  }
  const settings = adjustment.settings.trim();
  const repeated = (fn: (x: number) => number): GpuAdjustment => ({
    kind: 'lookup',
    values: Array.from({ length: 768 }, (_, i) => fn(i % 256))
  });
  if (settings === 'Invert') {
    return repeated((x) => 255 - x);
  }
  const single = /^(Threshold|Posterize)\(\s*(\d+),?\s*\)$/.exec(settings);
  if (single) {
    const value = Number(single[2]);
    if (single[1] === 'Threshold' && value >= 1 && value <= 255) {
      return { kind: 'threshold', level: value };
    }
    if (single[1] === 'Posterize' && value >= 2 && value <= 255) {
      return repeated((x) => Math.trunc((Math.trunc((x * value) / 256) * 255) / (value - 1)));
    }
  }
  const brightness =
    /^BrightnessContrast\s*\{\s*brightness:\s*(-?\d+),\s*contrast:\s*(-?\d+),\s*legacy:\s*true,?\s*\}$/.exec(settings);
  if (brightness) {
    const b = Number(brightness[1]);
    const c = Number(brightness[2]);
    if (b < -100 || b > 100 || c < -100 || c > 100) {
      return undefined;
    }
    return repeated((x) => {
      if (c < 0) {
        const scale = 255 + Math.trunc((c * 255) / 100);
        const d = x - 127;
        return clamp(127 + b + Math.sign(d) * Math.trunc((Math.abs(d) * scale + 127) / 255));
      }
      const denominator = 255 - Math.trunc((c * 255) / 100);
      const d = x + b - 127;
      return denominator === 0
        ? d >= 0
          ? 255
          : 0
        : clamp(127 + Math.sign(d) * Math.trunc((Math.abs(d) * 255 + Math.trunc(denominator / 2)) / denominator));
    });
  }
  if (settings.startsWith('Levels(')) {
    const records = parseArray(settings.slice(7, -1));
    if (
      !Array.isArray(records) ||
      records.length !== 29 ||
      !records.every(
        (record) =>
          Array.isArray(record) &&
          record.length === 5 &&
          record.every(Number.isInteger) &&
          record[0] >= 0 &&
          record[1] <= 255 &&
          record[0] <= record[1] &&
          record[2] >= 0 &&
          record[2] <= 255 &&
          record[3] >= 0 &&
          record[3] <= 255 &&
          record[4] === 100
      )
    ) {
      return undefined;
    }
    const luts = records.slice(0, 4).map((record: number[]) =>
      Array.from({ length: 256 }, (_, x) => {
        const [low, high, outLow, outHigh] = record as [number, number, number, number];
        const span = Math.max(high - low, 1);
        const index = Math.min(
          255,
          Math.trunc(((Math.min(high, Math.max(low, x)) - low) * 255 + Math.trunc(span / 2)) / span)
        );
        const delta = outHigh - outLow;
        return clamp(outLow + Math.sign(delta) * Math.trunc((Math.abs(delta) * index + 127) / 255));
      })
    );
    return { kind: 'lookup', values: [1, 2, 3].flatMap((channel) => luts[channel]!.map((x) => luts[0]![x]!)) };
  }
  return undefined;
}

function clamp(value: number) {
  return Math.max(0, Math.min(255, value));
}

/** Rust Debug arrays have trailing commas; never evaluate their contents as JavaScript. */
function parseArray(text: string): unknown {
  try {
    return JSON.parse(text.replace(/,\s*([\]])/g, '$1').replace(/,\s*$/, ''));
  } catch {
    return undefined;
  }
}
