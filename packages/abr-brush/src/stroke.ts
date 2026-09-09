import type { BrushTipImage } from '@app-game/abr-parser/reader';
import type { ColorMixing } from './colorMixing';
import type { BrushFormValues } from './form';
import { pencilUsesBackground, usesPencilCoverage } from './pencil';

/** Preview settings and synthetic or recorded tablet samples, independent of saved preset data. */
export type PreviewInput = {
  values: BrushFormValues;
  width: number;
  height: number;
  dpr: number;
  background: string;
  color: string;
  secondaryColor?: string;
  /** Normal-mode source-over working space. Omitted means Classic for Photoshop comparison. */
  colorMixing?: ColorMixing;
  opacity: number;
  flow: number;
  path?: PreviewPoint[];
  /** Unique per gesture on a canvas; allows completed frames to display while the same stroke continues. */
  strokeId?: number;
  tipScale?: number;
  /** Defaults to primary Scatter's full width. Dual tips retain the legacy radius model pending native parity. */
  scatterExtent?: 'width' | 'radius';
  /** Renders a resource swatch instead of a stroke, through the same worker queue. */
  resourcePreview?: 'tip' | 'dual' | 'pattern';
};
/** Normalized canvas coordinates with real tablet input and elapsed milliseconds. */
export type PreviewPoint = {
  x: number;
  y: number;
  pressure: number;
  tiltX: number;
  tiltY: number;
  rotation: number;
  /** Airbrush wheel, when supplied by the input device, in [-1, 1]. */
  tangentialPressure?: number;
  /** Normalized distance control; browser pointer events do not expose pen height. */
  distance?: number;
  time: number;
};
/** Four vec4 attributes per stamp: bounds, transform, dynamics (flow, opacity, depth, seed), RGB. */
export type PreviewStroke = {
  data: Float32Array;
  count: number;
  /** Mixer-only wetness/mix pairs, aligned with stamps; ordinary brush layout stays unchanged. */
  mixing?: Float32Array;
};
export const stampStride = 16;

/** Tools whose Flow can accumulate with elapsed contact time. Dormant flags survive tool changes. */
export function supportsAirbrush(tool: BrushFormValues['tool']): boolean {
  return tool.type === 'PbTl' || tool.type === 'MixB' || (tool.type === 'ErTl' && tool.eraserMode === 1);
}

/** Deterministic stamp placement shared by the worker's GPU and CPU renderers. */
export function createPreviewStroke(input: PreviewInput, tip: Pick<BrushTipImage, 'width' | 'height'>): PreviewStroke {
  const v = input.values;
  if (
    v.tool.type === 'PcTl' &&
    v.tool.autoErase &&
    pencilUsesBackground([...previewColor(input.background).map((value) => Math.round(value * 255)), 255], input.color)
  ) {
    input = { ...input, color: input.secondaryColor ?? '#ffffff', secondaryColor: input.color };
  }
  const points = smoothPoints(input.path?.length ? input.path : syntheticPath(), input);
  const diameter = Math.max(1, Math.min(v.diameter * input.dpr, input.height * 0.58, input.width * 0.16));
  const size =
    (input.path?.length
      ? v.diameter * input.dpr
      : diameter / (1 + (v.useScattering ? v.scattering.scatter / 100 : 0) * 1.5)) * (input.tipScale ?? 1);
  const sampler = createAbrStrokeSampler({ ...input, size, maxStamps: 16384 }, tip);
  return sampler.add(points.map((point) => ({ ...point, x: point.x * input.width, y: point.y * input.height })));
}

/** Incremental, viewport-independent stamp placement. Coordinates and size are document pixels.
 * Random state, spacing and fade survive input batches; preview restores all state after sampling.
 * There is no total-stroke stamp cap. Callers should submit input batches regularly.
 */
export function createAbrStrokeSampler(
  input: Pick<PreviewInput, 'values' | 'color' | 'secondaryColor' | 'opacity' | 'flow' | 'scatterExtent'> & {
    size: number;
    seed?: number;
    /** Preview-only budget. The document engine leaves this unset. */
    maxStamps?: number;
  },
  tip: Pick<BrushTipImage, 'width' | 'height'>
) {
  const v = input.values,
    shape = v.tool.pressureOverridesSize
      ? {
          ...v.shapeDynamics,
          sizeControl: 2,
          sizeJitter: v.useShapeDynamics ? v.shapeDynamics.sizeJitter : 0,
          minimumDiameter: v.useShapeDynamics ? v.shapeDynamics.minimumDiameter : 0
        }
      : v.shapeDynamics,
    scatter = v.scattering;
  // Photoshop's opacity override resets jitter/minimum; size preserves them only in an enabled section.
  // Keep the saved transfer values intact so switching the override off restores the preset.
  const transfer = v.tool.pressureOverridesOpacity
    ? { ...v.transfer, opacityControl: 2, opacityJitter: 0, opacityMinimum: 0 }
    : v.transfer;
  const buildUp = v.useBuildUp && supportsAirbrush(v.tool);
  // Only the sampled Smudge route has been traced in Photoshop 2025.
  const sampledSmudge = v.tool.type === 'SmTl' && v.tipKind === 'sampledBrush' && input.scatterExtent !== 'radius';
  const random = rng(input.seed ?? 0x6d2b79f5),
    colorRandom = rng((input.seed ?? 0x152dc2e1) ^ 0x124f),
    mixingRandom = rng((input.seed ?? 0x152dc2e1) ^ 0x46b9),
    scatterRandom = smudgeRandom((input.seed ?? 0x152dc2e1) ^ 3),
    countRandom = smudgeRandom((input.seed ?? 0x152dc2e1) ^ 4);
  const size = input.size;
  let data: number[] = [];
  let mixing: number[] = [];
  let nextDistance = 0,
    traveled = 0,
    step = 0,
    initialDirection = 0,
    nextTime = 0,
    direction = 0;
  let previous: PreviewPoint | undefined;
  let strokeColor: [number, number, number] | undefined;
  function add(points: readonly PreviewPoint[]): PreviewStroke {
    data = [];
    mixing = [];
    for (const b of points) {
      if (data.length / stampStride >= (input.maxStamps ?? Infinity)) break;
      if (!previous) {
        previous = { ...b };
        nextDistance = stamp(b, 0);
        nextTime = b.time + 30;
        continue;
      }
      const a = previous,
        dx = b.x - a.x,
        dy = b.y - a.y,
        length = Math.hypot(dx, dy);
      if (length > 0) {
        direction = Math.atan2(dy, dx);
        if (traveled === 0) initialDirection = direction;
      }
      for (; data.length / stampStride < (input.maxStamps ?? Infinity); ) {
        const distanceT = length > 0 ? Math.max(0, (nextDistance - traveled) / length) : Infinity;
        const timeT = buildUp && b.time > a.time ? Math.max(0, (nextTime - a.time) / (b.time - a.time)) : Infinity;
        if (Math.min(distanceT, timeT) > 1) break;
        if (distanceT <= timeT) nextDistance += stamp(interpolate(a, b, distanceT), direction);
        else {
          stamp(interpolate(a, b, timeT), direction);
          nextTime += 30;
        }
      }
      traveled += length;
      previous = { ...b };
    }
    return {
      data: new Float32Array(data),
      count: data.length / stampStride,
      ...(v.tool.type === 'MixB' ? { mixing: new Float32Array(mixing) } : {})
    };
  }
  return {
    add,
    preview(points: readonly PreviewPoint[]) {
      const saved = {
        nextDistance,
        traveled,
        step,
        initialDirection,
        nextTime,
        direction,
        previous,
        strokeColor,
        random: random.state(),
        color: colorRandom.state(),
        mixing: mixingRandom.state(),
        scatter: scatterRandom.state(),
        count: countRandom.state()
      };
      try {
        return add(points);
      } finally {
        ({ nextDistance, traveled, step, initialDirection, nextTime, direction, previous, strokeColor } = saved);
        random.restore(saved.random);
        colorRandom.restore(saved.color);
        mixingRandom.restore(saved.mixing);
        scatterRandom.restore(saved.scatter);
        countRandom.restore(saved.count);
        mixing = [];
        data = [];
      }
    }
  };
  function stamp(p: PreviewPoint, direction: number) {
    const pose = v.brushPose;
    const pressure = v.useBrushPose && pose.overridePressure ? pose.pressure / 100 : p.pressure;
    const tx = v.useBrushPose && pose.overrideTiltX ? pose.tiltX : p.tiltX;
    const ty = v.useBrushPose && pose.overrideTiltY ? pose.tiltY : p.tiltY;
    const rotation = v.useBrushPose && pose.overrideRotation ? pose.rotation : p.rotation;
    const inputValue = (control: number, fade: number, minimum = 0) => {
      let value = 1;
      if (control === 1) value = Math.max(0, 1 - step / Math.max(1, fade));
      else if (control === 2) value = pressure;
      else if (control === 3) value = Math.max(0, 1 - Math.min(100, Math.hypot(tx, ty)) / 100);
      else if (control === 4) value = p.tangentialPressure === undefined ? 1 : (p.tangentialPressure + 1) / 2;
      else if (control === 8) value = p.distance ?? 1;
      else if (control === 7) value = rotation / 360;
      return minimum / 100 + (1 - minimum / 100) * value;
    };
    let sizeFactor =
      v.useShapeDynamics || v.tool.pressureOverridesSize
        ? Math.max(
            shape.minimumDiameter / 100,
            inputValue(shape.sizeControl, shape.sizeFade, shape.minimumDiameter) *
              (1 - (random() * shape.sizeJitter) / 100)
          )
        : 1;
    if (v.tipKind === 'dBrush' && v.bristle.physics) sizeFactor *= 0.3 + 0.7 * pressure;
    if (v.tipKind === 'dTips' && v.erodible.physics)
      sizeFactor *= 1 + Math.min(0.5, ((step * v.erodible.softness) / 100) * 0.002);
    const stampSize = Math.max(0.05, size * sizeFactor);
    // Photoshop's primary Scatter percentage describes the entire distribution, not each side.
    // At diameter 50 and Scatter 208%, centers span 104 pixels, or ±52 from the stroke.
    const scatterAmount = v.useScattering
      ? ((size * scatter.scatter) / (input.scatterExtent === 'radius' ? 100 : 200)) *
        inputValue(scatter.control, scatter.fade)
      : 0;
    // Count Jitter varies around Count; empty intervals still advance spacing and fade below.
    const copies = v.useScattering
      ? sampledSmudge
        ? step === 0 && !scatter.bothAxes
          ? 1
          : smudgeCount(
              scatter.count,
              inputValue(scatter.countControl, scatter.countFade),
              scatter.countJitter,
              countRandom
            )
        : Math.max(
            0,
            Math.round(
              scatter.count *
                (1 + ((random() * 2 - 1) * scatter.countJitter) / 100) *
                inputValue(scatter.countControl, scatter.countFade)
            )
          )
      : 1;
    for (let copy = 0; copy < copies && data.length / stampStride < (input.maxStamps ?? Infinity); copy++) {
      let angle = (v.angle * Math.PI) / 180;
      let roundness = v.roundness / 100;
      if (v.useShapeDynamics) {
        angle += ((random() * 2 - 1) * Math.PI * shape.angleJitter) / 100;
        if (shape.angleControl === 5) angle += initialDirection;
        else if (shape.angleControl === 6) angle += direction;
        else if (shape.angleControl) angle += (1 - inputValue(shape.angleControl, shape.angleFade)) * Math.PI * 2;
        roundness *= Math.max(
          shape.roundnessMinimum / 100,
          inputValue(shape.roundnessControl, shape.roundnessFade, shape.roundnessMinimum) *
            (1 - (random() * shape.roundnessJitter) / 100)
        );
        if (shape.sizeControl === 3) roundness *= shape.tiltScale / 100;
        if (shape.brushProjection) {
          roundness *= Math.max(0.05, 1 - Math.hypot(tx, ty) / 120);
          angle += Math.atan2(ty, tx) + (rotation * Math.PI) / 180;
        }
      }
      let along: number, across: number;
      if (sampledSmudge) [along, across] = smudgeScatter(scatterAmount, v.useScattering && scatter.bothAxes, scatterRandom);
      else {
        along = v.useScattering && scatter.bothAxes ? (random() * 2 - 1) * scatterAmount : 0;
        across = (random() * 2 - 1) * scatterAmount;
      }
      const flow = usesPencilCoverage(v.tool)
        ? 1
        : input.flow *
          (v.useTransfer
            ? (1 - (random() * v.transfer.flowJitter) / 100) *
              inputValue(v.transfer.flowControl, v.transfer.flowFade, v.transfer.flowMinimum)
            : 1);
      const opacity = ['MixB', 'ShTl', 'BlTl'].includes(v.tool.type)
        ? 1
        : input.opacity *
          (v.useTransfer || v.tool.pressureOverridesOpacity
            ? (1 - (random() * transfer.opacityJitter) / 100) *
              inputValue(transfer.opacityControl, transfer.opacityFade, transfer.opacityMinimum)
            : 1);
      const depth =
        (v.texture.depth / 100) *
        (1 - (random() * v.texture.depthJitter) / 100) *
        inputValue(v.texture.depthControl, v.texture.depthFade, v.texture.minimumDepth);
      strokeColor ??= randomColor(input, colorRandom, inputValue(v.colorDynamics.control, v.colorDynamics.fade), step);
      const color =
        v.useColorDynamics && v.colorDynamics.applyPerTip
          ? randomColor(input, colorRandom, inputValue(v.colorDynamics.control, v.colorDynamics.fade), step)
          : strokeColor;
      const aspect = tip.width / Math.max(tip.width, tip.height),
        aspectY = tip.height / Math.max(tip.width, tip.height);
      if (v.tool.type === 'MixB') {
        const transfer = v.transfer;
        mixing.push(
          (v.tool.wetness / 100) *
            (v.useTransfer
              ? (1 - (mixingRandom() * transfer.wetnessJitter) / 100) *
                inputValue(transfer.wetnessControl, transfer.wetnessFade, transfer.wetnessMinimum)
              : 1),
          (v.tool.mix / 100) *
            (v.useTransfer
              ? (1 - (mixingRandom() * transfer.mixJitter) / 100) *
                inputValue(transfer.mixControl, transfer.mixFade, transfer.mixMinimum)
              : 1)
        );
      }
      const x = p.x + Math.cos(direction) * along - Math.sin(direction) * across;
      const y = p.y + Math.sin(direction) * along + Math.cos(direction) * across;
      data.push(
        usesPencilCoverage(v.tool) ? Math.floor(x) + 0.5 : x,
        usesPencilCoverage(v.tool) ? Math.floor(y) + 0.5 : y,
        stampSize * aspect * 0.5,
        stampSize * aspectY * Math.max(0.001, roundness) * 0.5,
        Math.cos(angle),
        Math.sin(angle),
        (v.flipX ? -1 : 1) * (v.useShapeDynamics && shape.flipXJitter && random() < 0.5 ? -1 : 1),
        (v.flipY ? -1 : 1) * (v.useShapeDynamics && shape.flipYJitter && random() < 0.5 ? -1 : 1),
        flow,
        opacity,
        depth,
        random() * 1000,
        ...color,
        1
      );
    }
    step++;
    return Math.max(0.25, stampSize * (v.spacingEnabled ? v.spacing / 100 : 0.01));
  }
}

/** Applies sampled-Smudge count dynamics before bounded, signed integer jitter. */
function smudgeCount(count: number, control: number, jitter: number, random: () => number): number {
  const dynamicCount = Math.trunc(1 + (count - 1) * control);
  if (jitter <= 0 || dynamicCount <= 0) return Math.max(0, dynamicCount);
  const amplitude = dynamicCount * jitter * 0.01;
  const bound = Math.trunc(amplitude);
  const offset = Math.max(-bound, Math.min(bound, Math.floor((random() * 2 - 1) * amplitude + 0.5)));
  return Math.max(0, dynamicCount + offset);
}

/** Native sampled-Smudge uses a signed radius, producing more marks near the center. */
function smudgeScatter(amount: number, bothAxes: boolean, random: () => number): [number, number] {
  if (amount <= 0) return [0, 0];
  const radius = (random() * 2 - 1) * amount;
  if (!bothAxes) return [0, radius];
  // Photoshop 2025's recovered helper wraps 720/360, then calls sin/cos directly.
  // Preserve its radians input; converting this value from degrees changes the distribution.
  const angle = (((random() - 0.5) * 720) % 360 + 360) % 360;
  return [Math.sin(angle) * radius, Math.cos(angle) * radius];
}

/** Park-Miller streams isolate native count/scatter channels. Host seeds are not Photoshop's seeds. */
function smudgeRandom(seed: number) {
  seed = ((seed >>> 0) % 2147483646) + 1;
  const next = () => {
    const quotient = Math.trunc(seed / 127773);
    seed = 16807 * (seed - quotient * 127773) - 2836 * quotient;
    if (seed < 0) seed += 2147483647;
    return seed / 2147483648;
  };
  return Object.assign(next, {
    state: () => seed,
    restore: (value: number) => {
      seed = value;
    }
  });
}

/** A secondary stroke masks the primary stroke; its size stays relative to the primary preset. */
export function dualPreviewInput(input: PreviewInput): PreviewInput {
  const v = input.values,
    d = v.dualBrush;
  return {
    ...input,
    tipScale: d.diameter / Math.max(1, v.diameter),
    scatterExtent: 'radius',
    color: '#ffffff',
    flow: 1,
    opacity: 1,
    values: {
      ...v,
      tool: { ...v.tool, type: 'PbTl', pressureOverridesSize: false, pressureOverridesOpacity: false },
      spacing: d.spacing,
      spacingEnabled: true,
      flipX: d.flip !== d.flipX,
      flipY: d.flipY,
      angle: d.angle,
      roundness: d.roundness,
      useShapeDynamics: false,
      useTexture: false,
      useDualBrush: false,
      useTransfer: false,
      useColorDynamics: false,
      useNoise: false,
      useWetEdges: false,
      useScattering: true,
      scattering: {
        scatter: d.scatter,
        bothAxes: d.bothAxes,
        control: 0,
        fade: 25,
        count: d.count,
        countJitter: 0,
        countControl: 0,
        countFade: 25
      }
    }
  };
}

/** Procedural round tip, stored as coverage so both backends sample it identically. */
export function generateComputedBrushTip(size: number, hardness: number): BrushTipImage {
  const data = new Uint8Array(size * size),
    hard = Math.max(0, Math.min(0.9999, hardness / 100));
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const radius = Math.hypot((x + 0.5 - size / 2) / (size / 2), (y + 0.5 - size / 2) / (size / 2));
      const t = Math.max(0, Math.min(1, (radius - hard) / (1 - hard)));
      data[y * size + x] = Math.round(255 * (1 - t * t * (3 - 2 * t)));
    }
  return { width: size, height: size, depth: 8, data };
}

/** Parses the preview's RGB color controls. */
export function previewColor(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function randomColor(
  input: Pick<PreviewInput, 'values' | 'color' | 'secondaryColor'>,
  random: () => number,
  control: number,
  step: number
): [number, number, number] {
  const foreground = previewColor(input.color),
    v = input.values.colorDynamics;
  if (!input.values.useColorDynamics) return foreground;
  const background = previewColor(input.secondaryColor ?? '#477ca6');
  const blend = Math.max(
    (random() * v.foregroundBackgroundJitter) / 100,
    v.control === 0 ? 0 : v.control === 1 ? Math.min(1, step / v.fade) : 1 - control
  );
  const rgb = foreground.map((c, i) => c * (1 - blend) + background[i]! * blend);
  const max = Math.max(...rgb),
    min = Math.min(...rgb),
    delta = max - min;
  let h =
    delta === 0
      ? 0
      : max === rgb[0]
        ? ((rgb[1]! - rgb[2]!) / delta) % 6
        : max === rgb[1]
          ? (rgb[2]! - rgb[0]!) / delta + 2
          : (rgb[0]! - rgb[1]!) / delta + 4;
  h = (((h / 6 + ((random() * 2 - 1) * v.hueJitter) / 100) % 1) + 1) % 1;
  let s = Math.max(0, Math.min(1, (max === 0 ? 0 : delta / max) + ((random() * 2 - 1) * v.saturationJitter) / 100));
  s = v.purity < 0 ? s * (1 + v.purity / 100) : s + ((1 - s) * v.purity) / 100;
  const b = Math.max(0, Math.min(1, max + ((random() * 2 - 1) * v.brightnessJitter) / 100));
  const channel = (n: number) => {
    const k = (n + h * 6) % 6;
    return b - b * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [channel(5), channel(3), channel(1)];
}
function syntheticPath(): PreviewPoint[] {
  return Array.from({ length: 257 }, (_, i) => {
    const t = i / 256;
    return {
      x: 0.1 + 0.8 * t,
      y: 0.5 + Math.sin(t * Math.PI * 2) * 0.12,
      pressure: Math.sin(t * Math.PI) ** 0.7,
      tiltX: Math.sin(t * Math.PI * 2) * 50,
      tiltY: 25,
      rotation: t * 360,
      time: t * 1000
    };
  });
}
function interpolate(a: PreviewPoint, b: PreviewPoint, t: number): PreviewPoint {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    pressure: a.pressure + (b.pressure - a.pressure) * t,
    tiltX: a.tiltX + (b.tiltX - a.tiltX) * t,
    tiltY: a.tiltY + (b.tiltY - a.tiltY) * t,
    rotation: a.rotation + (((b.rotation - a.rotation + 540) % 360) - 180) * t,
    tangentialPressure:
      a.tangentialPressure === undefined && b.tangentialPressure === undefined
        ? undefined
        : (a.tangentialPressure ?? 0) + ((b.tangentialPressure ?? 0) - (a.tangentialPressure ?? 0)) * t,
    distance:
      a.distance === undefined && b.distance === undefined
        ? undefined
        : (a.distance ?? 1) + ((b.distance ?? 1) - (a.distance ?? 1)) * t,
    time: a.time + (b.time - a.time) * t
  };
}
function smoothPoints(points: PreviewPoint[], input: PreviewInput) {
  if (!input.path?.length) return points;
  const smoother = createAbrSmoothing(input.values, input.dpr);
  const pixels = points.map((point) => ({ ...point, x: point.x * input.width, y: point.y * input.height }));
  const processed: PreviewPoint[] = [];
  const buildup = input.values.useBuildUp && supportsAirbrush(input.values.tool);
  let previous: PreviewPoint | undefined;
  for (const point of pixels) {
    const stationary = previous && point.x === previous.x && point.y === previous.y;
    // Replay held time before accepting its terminal sample, so elapsed time is not counted twice.
    const paused =
      stationary && point.time > previous!.time ? (smoother.idle?.(point.time - previous!.time) ?? []) : [];
    const emitted = smoother.add([point]);
    if (stationary && !emitted.length && point.time > previous!.time) {
      emitted.push(...paused);
      const last = processed.at(-1);
      if (!emitted.length && buildup && last && !input.values.smoothing.pulledString)
        emitted.push({ ...point, x: last.x, y: last.y });
    }
    processed.push(...emitted);
    previous = point;
  }
  return [...processed, ...smoother.finish()].map((point) => ({
    ...point,
    x: point.x / input.width,
    y: point.y / input.height
  }));
}

/** Streaming preset smoothing in pixel coordinates. The host can bypass it for raw input.
 * scale converts a CSS-pixel leash to document pixels; preview does not advance committed state.
 */
export function createAbrSmoothing(values: BrushFormValues, scale = 1) {
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('Smoothing scale must be positive and finite.');
  const s = { ...values.smoothing };
  const amount = values.useSmoothing ? s.amount / 100 : 0;
  const radius = amount * 30 * (s.adjustForZoom ? scale : 1);
  let previous: PreviewPoint | undefined, latest: PreviewPoint | undefined;
  let started = false;
  let finished = false;
  const canCatchUp = amount > 0 && s.catchUp && !s.pulledString;
  return {
    add(points: readonly PreviewPoint[]): PreviewPoint[] {
      if (finished) return [];
      const output: PreviewPoint[] = [];
      for (const point of points) {
        if (![point.x, point.y, point.pressure, point.time].every(Number.isFinite)) continue;
        latest = { ...point };
        if (!amount) {
          previous = latest;
          output.push(latest);
          continue;
        }
        if (!previous) {
          previous = latest;
          if (!s.pulledString) {
            started = true;
            output.push(previous);
          }
          continue;
        }
        const distance = Math.hypot(point.x - previous.x, point.y - previous.y);
        // A slack string never paints, even if dormant catch-up options remain enabled.
        if (distance <= radius) continue;
        const t = (distance - radius) / distance;
        if (!started) {
          output.push(previous);
          started = true;
        }
        previous = { ...point, x: previous.x + (point.x - previous.x) * t, y: previous.y + (point.y - previous.y) * t };
        output.push(previous);
      }
      return output;
    },
    /** Advances a paused stroke by elapsed milliseconds. No pointer samples or state-mutating preview are invented. */
    idle: canCatchUp
      ? (elapsedMs: number): PreviewPoint[] => {
          if (finished || !latest || !previous || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return [];
          const distance = Math.hypot(latest.x - previous.x, latest.y - previous.y);
          if (!distance) return [];
          const t = 1 - Math.exp(-elapsedMs / (20 + amount * 120));
          const done = distance * (1 - t) <= 0.01 * scale;
          previous = {
            ...latest,
            x: done ? latest.x : previous.x + (latest.x - previous.x) * t,
            y: done ? latest.y : previous.y + (latest.y - previous.y) * t,
            time: Math.max(latest.time, previous.time) + elapsedMs
          };
          return [previous];
        }
      : undefined,
    preview: (): PreviewPoint[] => [],
    finish(): PreviewPoint[] {
      if (finished) return [];
      finished = true;
      return amount &&
        !s.pulledString &&
        s.catchUpAtEnd &&
        latest &&
        previous &&
        (previous.x !== latest.x || previous.y !== latest.y)
        ? [{ ...latest, time: Math.max(latest.time, previous.time) }]
        : [];
    }
  };
}
function rng(seed: number) {
  seed ||= 0x6d2b79f5;
  const next = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  return Object.assign(next, {
    state: () => seed,
    restore: (value: number) => {
      seed = value;
    }
  });
}
