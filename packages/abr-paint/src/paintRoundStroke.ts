import { createPaintDistance } from '@app-game/abr-brush/stroke';
import { brushQualityAtLod } from './adaptiveQuality';
import type { AbrBrushInput, AbrStrokeContext, AbrStrokeSession } from './contracts';
import type { Dab, Sample } from './input';

/** Samples nominal round instances directly. The analytic renderer needs neither tip pixels nor ABR transform records. */
export function createPaintRoundStroke<L, C, B extends AbrBrushInput>({
  brush,
  settings,
  renderer,
  processor,
  layer,
  adaptiveQuality,
  lod
}: Omit<AbrStrokeContext<L, C, B>, 'resources'>): AbrStrokeSession<C> {
  const v = settings.values;
  const pressureSize = v.tool.pressureOverridesSize || (v.useShapeDynamics && v.shapeDynamics.sizeControl === 2);
  const minimum = v.useShapeDynamics ? v.shapeDynamics.minimumDiameter / 100 : 0;
  const pressureFlow = v.useTransfer && v.transfer.flowControl === 2;
  const spacing = v.spacingEnabled && v.spacing > 0 ? v.spacing / 100 : 0.01;
  const distance = createPaintDistance(
    brush.size,
    spacing,
    pressureSize,
    brushQualityAtLod(adaptiveQuality ?? false, lod)?.minimumSpacing
  );
  const baseRadius = brush.size * 0.5;
  const baseFlow = brush.flow;
  const ratio = distance.ratio;
  let previous: Sample | undefined;
  let remaining = 1;
  renderer.begin(layer, brush, undefined, {
    coverage: 'paint-round-v1',
    values: v,
    size: brush.size,
    mixing: brush.mixing,
    compositeOpacity: brush.opacity
  });

  return {
    add: (samples) => renderer.paint(sample(processor.add(samples))),
    preview(enabled) {
      const saved = previous,
        phase = remaining;
      const tail = enabled ? sample(processor.preview()) : [];
      previous = saved;
      remaining = phase;
      renderer.preview(tail);
    },
    async finish() {
      await renderer.paint(sample(processor.finish()));
      return renderer.finish();
    },
    cancel: () => renderer.cancel(),
    idle:
      processor.idle &&
      (async (ms) => {
        const points = processor.idle!(ms);
        await renderer.paint(sample(points));
        return points.length > 0;
      })
  };

  function sample(points: readonly Sample[]) {
    const result: Dab[] = [];
    for (const point of points) {
      if (![point.x, point.y, point.pressure, point.time].every(Number.isFinite)) {
        continue;
      }

      const pressure = Math.max(0, Math.min(1, point.pressure));
      const a = previous;
      if (a) {
        const dx = point.x - a.x,
          dy = point.y - a.y,
          dp = pressure - a.pressure;
        const length = Math.hypot(dx, dy);
        // Constant-pressure lines can reuse size and compensated flow for the entire segment.
        if (dp === 0 && length > 0) {
          const step = distance.step(pressure);
          const intervals = length / step;
          const radius = radiusAt(pressure),
            flow = flowAt(pressure);
          while (remaining <= intervals + 1e-10) {
            const t = Math.min(length, remaining * step) / length;
            result.push({ x: a.x + dx * t, y: a.y + dy * t, radius, flow });
            remaining++;
          }
          remaining -= intervals;
        } else {
          remaining = distance.segment(length, a.pressure, pressure, remaining, (t) => {
            emit(a.x + dx * t, a.y + dy * t, a.pressure + dp * t);
            return true;
          });
        }
      } else {
        emit(point.x, point.y, pressure);
      }
      previous = { ...point, pressure };
    }
    return result;

    function emit(x: number, y: number, pressure: number) {
      result.push({ x, y, radius: radiusAt(pressure), flow: flowAt(pressure) });
    }
  }

  function radiusAt(pressure: number) {
    return Math.max(0.25, baseRadius * (pressureSize ? Math.max(minimum, pressure) : 1));
  }

  function flowAt(pressure: number) {
    const flow = baseFlow * (pressureFlow ? pressure : 1);
    return ratio > 1 ? 1 - (1 - flow) ** ratio : flow;
  }
}
