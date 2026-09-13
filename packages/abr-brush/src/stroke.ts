import { secondaryScatterOffset } from './secondaryDynamics';
import { createBrushRandomChannels } from './randomChannels';
import { deviceControlValue, deviceControlInput } from './deviceControl';
import { browserTabletInput, prepareTabletInput } from './tabletInput';
import { placeSampledTip } from './tipPlacement';
import { sampledTipSpacing, computedTipSpacing } from './tipSpacing';
import { sampledTipTransform, secondaryTipTransform, sampledTipScale, sampledTipRenderScale } from './sampledTipRaster';
import type { BrushTipImage } from '@app-game/abr-parser/reader';
import type { ColorMixing } from './colorMixing';
import type { BrushFormValues } from './form';
import { pencilUsesBackground, usesPencilCoverage } from './pencil';
import { textureDepth } from './textureDynamics';
import { dabColor } from './colorDynamics';
import { transferValue } from './transferDynamics';
import { directionalTipAngle, primaryRoundnessChange, primarySizeValue, tiltTipAngle, tabletTiltMagnitude, deviceTipAngle } from './shapeDynamics';

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
  /** Global tool opacity, normalized to 0..1. Paintbrush applies it after mask composition. */
  opacity: number;
  flow: number;
  path?: PreviewPoint[];
  /** Optional 24-channel state for repeatable programmatic strokes; copied at sampler creation. */
  randomState?: readonly number[];
  /** Known initial tangent in document coordinates for programmatic paths.
   * Omit for live input: contact has no direction until the first movement.
   */
  initialTangent?: { x: number; y: number };
  /** Unique per gesture on a canvas; allows completed frames to display while the same stroke continues. */
  strokeId?: number;
  tipScale?: number;
  /** Selects Photoshop's primary or secondary-tip placement contract. Defaults to primary. */
  stampRole?: 'primary' | 'secondary';
  /** Renders a resource swatch instead of a stroke, through the same worker queue. */
  resourcePreview?: 'tip' | 'dual' | 'pattern';
};
/** Normalized canvas coordinates with real tablet input and elapsed milliseconds. */
export type PreviewPoint = {
  x: number;
  y: number;
  pressure: number;
  /** Browser tilt degrees, in [-90, 90]. Brush Pose uses percentages separately. */
  tiltX: number;
  tiltY: number;
  rotation: number;
  /** Omitted for synthetic recordings; mouse lacks pressure and pen-axis capabilities. */
  pointerType?: string;
  /** Airbrush wheel, when supplied by the input device, in [-1, 1]. */
  tangentialPressure?: number;
  /** Optional tracking height; browser pointer events do not expose it. Dial uses rotation. */
  distance?: number;
  time: number;
};
/** Four vec4 attributes per stamp: bounds, transform, dynamics (flow, opacity, depth, seed), RGB.
 * Paintbrush opacity excludes global tool opacity; compositors must also apply strokeCompositeOpacity.
 */
export type PreviewStroke = {
  data: Float32Array;
  count: number;
  /** Mixer-only wetness/mix pairs, aligned with stamps; ordinary brush layout stays unchanged. */
  mixing?: Float32Array;
  /** Primary/secondary sampled-source placement retained in double precision through row planning. */
  sampledTips?: ReturnType<typeof sampledTipTransform>[];
};
export const stampStride = 16;

/**
 * Global opacity applied after primary/texture/dual mask composition for traced Paintbrush tips.
 * Other tool paths currently carry opacity in their stamps, so their compositor factor is 1.
 * Photoshop stores the tool percentage as a byte before normalizing it for composition.
 */
export function strokeCompositeOpacity(input: Pick<PreviewInput, 'values' | 'opacity' | 'stampRole'>): number {
  return usesPaintbrushTransfer(input) ? Math.max(0, Math.min(255, Math.round(input.opacity * 255))) / 255 : 1;
}

/** Selects the sampled/computed Paintbrush method whose transfer dispatch has been traced. */
function usesPaintbrushTransfer(input: Pick<PreviewInput, 'values' | 'stampRole'>): boolean {
  return input.stampRole !== 'secondary' && input.values.tool.type === 'PbTl' &&
    (input.values.tipKind === 'sampledBrush' || input.values.tipKind === 'computedBrush');
}

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
  const size = previewStrokeSize(input);
  const sampler = createAbrStrokeSampler({ ...input, size, maxStamps: 16384, sampledTipGeometry: true }, tip);
  return sampler.add(points.map((point) => ({ ...point, x: point.x * input.width, y: point.y * input.height })));
}

/** Nominal preview diameter in output pixels, shared by placement and computed source preparation. */
export function previewStrokeSize(input: PreviewInput): number {
  const v = input.values;
  const diameter = Math.max(1, Math.min(v.diameter * input.dpr, input.height * 0.58, input.width * 0.16));
  const size =
    (input.path?.length
      ? v.diameter * input.dpr
      : diameter / (1 + (v.useScattering ? v.scattering.scatter / 100 : 0) * 1.5)) * (input.tipScale ?? 1);
  return size;
}

/** Incremental, viewport-independent stamp placement. Coordinates and size are document pixels.
 * Random state, spacing and fade survive input batches; preview restores all state after sampling.
 * There is no total-stroke stamp cap. Callers should submit input batches regularly.
 */
export function createAbrStrokeSampler(
  input: Pick<PreviewInput, 'values' | 'color' | 'secondaryColor' | 'opacity' | 'flow' | 'stampRole' | 'randomState' | 'initialTangent'> & {
    size: number;
    seed?: number;
    /** Retains source geometry for consumers using Photoshop row rasterization. Defaults to false. */
    sampledTipGeometry?: boolean;
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
          sizeMinimum: v.useShapeDynamics ? v.shapeDynamics.sizeMinimum : 0,
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
  // Photoshop 2025's common count/placement path is shared by these stamp tools.
  // Physical tips still need their own call-path trace.
  const secondary = input.stampRole === 'secondary';
  const photoshopPlacement =
    ['PbTl', 'PcTl', 'SmTl', 'BlTl', 'ShTl'].includes(v.tool.type) &&
    (v.tipKind === 'sampledBrush' || v.tipKind === 'computedBrush') &&
    !secondary;
  const paintbrushTransfer = usesPaintbrushTransfer(input);
  // Sampled primary-tip branch in Photoshop 0x103e3ae9c (f8 predicate is zero).
  const sampledShape = !secondary && v.tool.type === 'PbTl' && v.tipKind === 'sampledBrush';
  const channels = createBrushRandomChannels(input.seed, input.randomState);
  const random = rng(input.seed ?? 0x6d2b79f5),
    colorRandom = rng((input.seed ?? 0x152dc2e1) ^ 0x124f),
    mixingRandom = rng((input.seed ?? 0x152dc2e1) ^ 0x46b9),
    scatterRandom = channels.channel(secondary ? 14 : 3),
    angleRandom = channels.channel(sampledShape ? 1 : 12),
    flipXRandom = channels.channel(sampledShape ? 17 : 19),
    flipYRandom = channels.channel(sampledShape ? 18 : 20),
    countRandom = channels.channel(4),
    depthRandom = channels.channel(5),
    flowRandom = channels.channel(7),
    opacityRandom = channels.channel(6);
  const sizeRandom = channels.channel(0), roundnessRandom = channels.channel(2);
  const colorStreams = {
    foreground: channels.channel(8),
    hue: channels.channel(9),
    saturation: channels.channel(10),
    brightness: channels.channel(11)
  };
  const foreground16 = previewColor(input.color).map((c) => Math.round(c * 32768));
  const background16 = previewColor(input.secondaryColor ?? '#477ca6').map((c) => Math.round(c * 32768));
  const size = input.size;
  let data: number[] = [];
  let mixing: number[] = [];
  let sampledTips: NonNullable<PreviewStroke['sampledTips']> = [];
  const sampledPrimary = input.sampledTipGeometry && !secondary && v.tool.type === 'PbTl' && v.tipKind === 'sampledBrush';
  const computedSecondary = input.sampledTipGeometry && secondary && v.tipKind === 'computedBrush';
  const sampledSecondary = input.sampledTipGeometry && secondary && (v.tipKind === 'sampledBrush' || computedSecondary);
  let nextDistance = 0,
    traveled = 0,
    step = 0,
    initialDirection = input.initialTangent ? Math.atan2(input.initialTangent.y, input.initialTangent.x) : 0,
    nextTime = 0,
    direction = initialDirection;
  let previous: PreviewPoint | undefined;
  let directionVector = { ...(input.initialTangent ?? { x: 0, y: 0 }) }, initialVector = directionVector;
  let strokeColor: [number, number, number] | undefined;
  function add(points: readonly PreviewPoint[]): PreviewStroke {
    data = [];
    mixing = [];
    sampledTips = [];
    for (const b of points) {
      if (data.length / stampStride >= (input.maxStamps ?? Infinity)) break;
      if (!previous) {
        previous = { ...b };
        nextDistance = stamp(b, direction);
        nextTime = b.time + 30;
        continue;
      }
      const a = previous,
        dx = b.x - a.x,
        dy = b.y - a.y,
        length = Math.hypot(dx, dy);
      if (length > 0) {
        directionVector = { x: dx, y: dy };
        direction = Math.atan2(dy, dx);
        if (traveled === 0 && !input.initialTangent) {
          initialDirection = direction;
          initialVector = directionVector;
        }
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
      ...(sampledPrimary || sampledSecondary ? { sampledTips } : {}),
      ...(v.tool.type === 'MixB' ? { mixing: new Float32Array(mixing) } : {})
    };
  }
  return {
    add,
    /** Snapshot of the 24 native dynamics channels; legacy tool/noise streams are separate. */
    randomState: channels.snapshot,
    preview(points: readonly PreviewPoint[]) {
      const saved = {
        nextDistance,
        traveled,
        step,
        initialDirection,
        directionVector,
        initialVector,
        nextTime,
        direction,
        previous,
        strokeColor,
        random: random.state(),
        color: colorRandom.state(),
        colorStreams: Object.values(colorStreams).map((stream) => stream.state()),
        mixing: mixingRandom.state(),
        scatter: scatterRandom.state(),
        angle: angleRandom.state(),
        flipX: flipXRandom.state(),
        flipY: flipYRandom.state(),
        count: countRandom.state(),
        depth: depthRandom.state(),
        flow: flowRandom.state(),
        opacity: opacityRandom.state(),
        roundness: roundnessRandom.state(),
        size: sizeRandom.state()
      };
      try {
        return add(points);
      } finally {
        ({ nextDistance, traveled, step, initialDirection, directionVector, initialVector, nextTime, direction, previous, strokeColor } = saved);
        random.restore(saved.random);
        colorRandom.restore(saved.color);
        Object.values(colorStreams).forEach((stream, i) => stream.restore(saved.colorStreams[i]!));
        mixingRandom.restore(saved.mixing);
        scatterRandom.restore(saved.scatter);
        angleRandom.restore(saved.angle);
        flipXRandom.restore(saved.flipX);
        flipYRandom.restore(saved.flipY);
        countRandom.restore(saved.count);
        depthRandom.restore(saved.depth);
        flowRandom.restore(saved.flow);
        opacityRandom.restore(saved.opacity);
        sizeRandom.restore(saved.size);
        roundnessRandom.restore(saved.roundness);
        mixing = [];
        sampledTips = [];
        data = [];
      }
    }
  };
  function stamp(p: PreviewPoint, direction: number) {
    const tablet = prepareTabletInput(browserTabletInput(p), v.useBrushPose ? v.brushPose : undefined);
    const { pressure, rotation, tiltX: tx, tiltY: ty } = tablet;
    const tiltMagnitude = tabletTiltMagnitude({ x: tx, y: ty });
    const inputValue = (control: number, fade: number, minimum = 0) =>
      deviceControlValue(control, fade, minimum, step, tablet);
    const evaluateColor = (): [number, number, number] => {
      if (!v.useColorDynamics) return previewColor(input.color);
      const device = paintbrushTransfer ? deviceControlInput(v.colorDynamics.control, tablet)
        : inputValue(v.colorDynamics.control, v.colorDynamics.fade);
      if (!paintbrushTransfer) return unverifiedToolColor(input, colorRandom, device, step);
      const rgb = dabColor(foreground16, background16, v.colorDynamics, device, step, colorStreams);
      return [rgb[0] / 32768, rgb[1] / 32768, rgb[2] / 32768];
    };
    // Photoshop evaluates whole-stroke color from the initial contact, even if
    // Count prevents that contact from depositing a stamp.
    if (paintbrushTransfer && !v.colorDynamics.applyPerTip) strokeColor ??= evaluateColor();
    let sizeFactor =
      !sampledShape && (v.useShapeDynamics || v.tool.pressureOverridesSize)
        ? Math.max(
            shape.minimumDiameter / 100,
            inputValue(shape.sizeControl, shape.sizeFade, shape.minimumDiameter) *
              (1 - (random() * shape.sizeJitter) / 100)
          )
        : 1;
    if (v.tipKind === 'dBrush' && v.bristle.physics) sizeFactor *= 0.3 + 0.7 * pressure;
    if (v.tipKind === 'dTips' && v.erodible.physics)
      sizeFactor *= 1 + Math.min(0.5, ((step * v.erodible.softness) / 100) * 0.002);
    let stampSize = Math.max(0.05, size * sizeFactor);
    let sampledScale = sampledTipScale(size, Math.max(tip.width, tip.height));
    // Photoshop's primary Scatter percentage describes the entire distribution, not each side.
    // At diameter 50 and Scatter 208%, centers span 104 pixels, or ±52 from the stroke.
    const secondaryDiameter = v.tipKind === 'computedBrush'
      ? Math.max(1, Math.min(5000, Math.trunc(size + 0.5)))
      : sampledScale * Math.max(tip.width, tip.height);
    const baseScatterAmount = secondary
      ? (v.useScattering ? scatter.scatter * 0.01 * (secondaryDiameter * 0.5) : 0)
      : v.useScattering && !(photoshopPlacement && step === 0 && !scatter.bothAxes)
        ? ((size * scatter.scatter) / 200) * inputValue(scatter.control, scatter.fade)
        : 0;
    // Count Jitter varies around Count; empty intervals still advance spacing and fade below.
    const copies = secondary
      ? scatter.count
      : v.useScattering
        ? photoshopPlacement
          ? step === 0 && !scatter.bothAxes
            ? 1
            : scatterCount(
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
      if (sampledShape) {
        // The original evaluates size inside each Count copy, before placement.
        const active = v.useShapeDynamics || v.tool.pressureOverridesSize;
        const value = active ? primarySizeValue(shape.sizeControl, shape.sizeFade, shape.sizeMinimum,
          shape.sizeJitter, shape.sizeControl === 3 ? pressure : inputValue(shape.sizeControl, shape.sizeFade),
          step, sizeRandom) : 1;
        sampledScale = sampledTipScale(size, Math.max(tip.width, tip.height),
          active ? { minimumDiameter: shape.minimumDiameter, value } : undefined);
        stampSize = sampledScale * Math.max(tip.width, tip.height);
      }
      const scatterAmount = sampledShape && baseScatterAmount !== 0
        ? ((stampSize * scatter.scatter) / 200) * inputValue(scatter.control, scatter.fade)
        : baseScatterAmount;
      // Secondary marks always use a separate signed 360-degree rotation draw.
      const angleDegrees = (computedSecondary ? 0 : v.angle) + (secondary ? (angleRandom() * 2 - 1) * 360 : 0);
      let angle = (angleDegrees * Math.PI) / 180;
      let sampledControlAngle = 0;
      let sampledJitterAngle = 0;
      let roundness = v.roundness / 100;
      if (v.useShapeDynamics) {
        const directional = shape.angleControl === 5 || shape.angleControl === 6;
        if (sampledShape) {
          sampledControlAngle = directional
            ? directionalTipAngle(shape.angleControl as 5 | 6, directionVector, initialVector)
            : shape.angleControl === 3 ? tiltTipAngle({ x: tx, y: ty })
            : deviceTipAngle(shape.angleControl, shape.angleFade, 0, step, tablet);
          // Original helper 0x10212e78c: signed ±360°, scaled by jitter.
          // Disabled jitter must leave channel 1 untouched.
          if (shape.angleJitter > 0) {
            const amplitude = shape.angleJitter * 0.01 * 360;
            sampledJitterAngle = (amplitude + amplitude) * (angleRandom() - 0.5);
          }
          angle = ((angleDegrees + sampledControlAngle + sampledJitterAngle) * Math.PI) / 180;
        } else angle += ((random() * 2 - 1) * Math.PI * shape.angleJitter) / 100;
        if (!sampledShape && shape.angleControl === 5) angle += initialDirection;
        else if (!sampledShape && shape.angleControl === 6) angle += direction;
        else if (!sampledShape && !directional && shape.angleControl) {
          const controlOffset = (1 - inputValue(shape.angleControl, shape.angleFade)) * 360;
          sampledControlAngle = controlOffset;
          angle += controlOffset * Math.PI / 180;
        }
        if (sampledShape) roundness += primaryRoundnessChange(v.roundness, shape.roundnessMinimum,
          shape.roundnessControl, shape.roundnessControlMinimum, shape.roundnessFade, shape.roundnessJitter,
          step, tablet, roundnessRandom);
        else roundness *= Math.max(
          shape.roundnessMinimum / 100,
          inputValue(shape.roundnessControl, shape.roundnessFade, shape.roundnessMinimum) *
            (1 - (random() * shape.roundnessJitter) / 100)
        );
        if (!sampledShape && shape.sizeControl === 3) roundness *= shape.tiltScale / 100;
        if (shape.brushProjection && !sampledPrimary) {
          roundness *= Math.max(0.05, 1 - Math.hypot(tx, ty) / 1.2);
          angle += Math.atan2(ty, tx) + (rotation * Math.PI) / 180;
        }
      }
      let along: number, across: number;
      // With no direction at contact, Photoshop scatters secondary marks radially,
      // including when Both Axes is disabled. Later marks follow the stroke normal.
      const radialScatter = scatter.bothAxes;
      if (secondary)
        [along, across] = secondaryScatterOffset(scatterAmount, directionVector, radialScatter, scatterRandom);
      else if (photoshopPlacement)
        [along, across] = scatterOffset(scatterAmount, v.useScattering && radialScatter, scatterRandom, sampledShape);
      else {
        along = v.useScattering && scatter.bothAxes ? (random() * 2 - 1) * scatterAmount : 0;
        across = (random() * 2 - 1) * scatterAmount;
      }
      const primaryFlipX = sampledShape && v.useShapeDynamics && shape.flipXJitter && flipXRandom() >= 0.5;
      const primaryFlipY = sampledShape && v.useShapeDynamics && shape.flipYJitter && flipYRandom() >= 0.5;
      // A zero-scale primary still evaluates placement dynamics, but deposits no mask.
      if (sampledShape && sampledScale <= 0) continue;
      const renderedScale = sampledShape
        ? sampledTipRenderScale(sampledScale, Math.max(tip.width, tip.height)) : sampledScale;
      const renderedSize = sampledShape ? renderedScale * Math.max(tip.width, tip.height) : stampSize;
      const flow = usesPencilCoverage(v.tool)
        ? 1
        : paintbrushTransfer
          ? transferValue(
              Math.round(input.flow * 255) / 255,
              v.useTransfer ? transfer.flowControl : 0,
              transfer.flowFade,
              transfer.flowMinimum,
              v.useTransfer ? transfer.flowJitter : 0,
              inputValue(transfer.flowControl, transfer.flowFade),
              step,
              flowRandom
            )
          : input.flow *
          (v.useTransfer
            ? (1 - (random() * v.transfer.flowJitter) / 100) *
              inputValue(v.transfer.flowControl, v.transfer.flowFade, v.transfer.flowMinimum)
            : 1);
      const opacity = ['MixB', 'ShTl', 'BlTl'].includes(v.tool.type)
        ? 1
        : paintbrushTransfer
          ? transferValue(
              1,
              v.useTransfer || v.tool.pressureOverridesOpacity ? transfer.opacityControl : 0,
              transfer.opacityFade,
              transfer.opacityMinimum,
              v.useTransfer || v.tool.pressureOverridesOpacity ? transfer.opacityJitter : 0,
              inputValue(transfer.opacityControl, transfer.opacityFade),
              step,
              opacityRandom
            )
          : input.opacity *
          (v.useTransfer || v.tool.pressureOverridesOpacity
            ? (1 - (random() * transfer.opacityJitter) / 100) *
              inputValue(transfer.opacityControl, transfer.opacityFade, transfer.opacityMinimum)
            : 1);
      const depth = textureDepth(v.texture, deviceControlInput(v.texture.depthControl, tablet), step, depthRandom);
      // Per-tip color has no extra discarded stroke-start evaluation in Photoshop.
      const color = v.useColorDynamics && v.colorDynamics.applyPerTip
        ? evaluateColor()
        : (strokeColor ??= evaluateColor());
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
      // Both-axis offsets are already in document coordinates. Only one-axis scatter
      // follows the stroke normal in Photoshop's common placement routine.
      const scatterDirection = secondary || (photoshopPlacement && radialScatter) ? 0 : direction;
      const x = p.x + Math.cos(scatterDirection) * along - Math.sin(scatterDirection) * across;
      const y = p.y + Math.sin(scatterDirection) * along + Math.cos(scatterDirection) * across;
      data.push(
        usesPencilCoverage(v.tool) ? Math.floor(x) + 0.5 : x,
        usesPencilCoverage(v.tool) ? Math.floor(y) + 0.5 : y,
        renderedSize * aspect * 0.5,
        renderedSize * aspectY * Math.max(0.001, roundness) * 0.5,
        Math.cos(angle),
        Math.sin(angle),
        (v.flipX ? -1 : 1) *
          (secondary
            ? v.dualBrush.flip && flipXRandom() >= 0.5
              ? -1
              : 1
            : sampledShape ? primaryFlipX ? -1 : 1
            : v.useShapeDynamics && shape.flipXJitter && random() < 0.5
              ? -1
              : 1),
        (v.flipY ? -1 : 1) *
          (secondary
            ? v.dualBrush.flip && flipYRandom() >= 0.5
              ? -1
              : 1
            : sampledShape ? primaryFlipY ? -1 : 1
            : v.useShapeDynamics && shape.flipYJitter && random() < 0.5
              ? -1
              : 1),
        flow,
        opacity,
        depth,
        random() * 1000,
        ...color,
        1
      );
      if (sampledPrimary) {
        const scale = sampledScale;
        const stretch = v.useShapeDynamics && shape.sizeControl === 3 && !v.tool.pressureOverridesSize;
        const tilt = stretch ? { magnitude: tiltMagnitude, amount: shape.tiltScale,
          direction: sampledControlAngle, beforeRotation: false } : undefined;
        const angleChange = (angle - v.angle * Math.PI / 180) * 180 / Math.PI;
        const roundnessChange = roundness - v.roundness * .01;
        const nominalSize = Math.max(1, Math.min(5000, Math.trunc(size + .5)));
        const placement = placeSampledTip({ x, y }, {
          left: -Math.floor(tip.width / 2) - 1, top: -Math.floor(tip.height / 2) - 1,
          right: Math.ceil(tip.width / 2) + 1, bottom: Math.ceil(tip.height / 2) + 1
        }, {
          fractional: true, tipOffset: false,
          snapIdentity: !v.useDualBrush && v.spacing > 10 && nominalSize > 60,
          scale, angle: 0, tilt: stretch ? tiltMagnitude : 0, angleJitter: angleChange, roundnessChange
        });
        sampledTips.push(sampledTipTransform(placement.sourceBounds, placement.center, renderedScale,
          tilt ? angleDegrees + sampledJitterAngle : v.angle + angleChange, v.roundness, roundnessChange,
          data[data.length - stampStride + 6]! < 0, data[data.length - stampStride + 7]! < 0, tilt,
          v.useShapeDynamics && shape.brushProjection ? {
            stored: v.angle, jitter: sampledJitterAngle, control: sampledControlAngle, tablet
          } : undefined));
      }
      if (sampledSecondary) {
        sampledTips.push(secondaryTipTransform(tip, { x, y }, computedSecondary ? 1 : sampledScale, angleDegrees,
          data[data.length - stampStride + 6]! < 0, data[data.length - stampStride + 7]! < 0));
      }
    }
    step++;
    const percent = v.spacingEnabled ? Math.trunc(v.spacing) : 0;
    const advance = v.tipKind === 'sampledBrush'
      ? sampledTipSpacing(sampledShape ? sampledScale : sampledTipScale(size, Math.max(tip.width, tip.height)) * sizeFactor,
          tip, percent)
      : v.tipKind === 'computedBrush'
        ? computedTipSpacing(size, Math.trunc(v.roundness), sizeFactor, percent)
        : stampSize * (v.spacingEnabled ? v.spacing / 100 : 0.01);
    // Photoshop's primary and secondary spacing loops both clamp the advance to
    // one document pixel, including their subpixel-coordinate paths.
    return Math.max(
      photoshopPlacement || secondary ? 1 : 0.25,
      advance
    );
  }
}

/** Applies Photoshop's common stamp-count control before bounded, signed integer jitter. */
function scatterCount(count: number, control: number, jitter: number, random: () => number): number {
  const dynamicCount = Math.trunc(1 + (count - 1) * control);
  if (jitter <= 0 || dynamicCount <= 0) return Math.max(0, dynamicCount);
  const amplitude = dynamicCount * jitter * 0.01;
  const bound = Math.trunc(amplitude);
  const offset = Math.max(-bound, Math.min(bound, Math.floor((random() * 2 - 1) * amplitude + 0.5)));
  return Math.max(0, dynamicCount + offset);
}

/** Photoshop's common placement routine uses a signed radius, concentrating marks near the center. */
function scatterOffset(amount: number, bothAxes: boolean, random: () => number, primary = false): [number, number] {
  if (amount <= 0) return [0, 0];
  const radius = (random() * 2 - 1) * amount;
  if (!bothAxes) return [0, primary ? -radius : radius];
  // Photoshop 2025's recovered helper wraps 720/360, then calls sin/cos directly.
  // Preserve its radians input; converting this value from degrees changes the distribution.
  const angle = ((((random() - 0.5) * 720) % 360) + 360) % 360;
  return primary ? [Math.cos(angle) * radius, Math.sin(angle) * radius]
    : [Math.sin(angle) * radius, Math.cos(angle) * radius];
}

/** A secondary stroke masks the primary stroke; its size stays relative to the primary preset. */
export function dualPreviewInput(input: PreviewInput): PreviewInput {
  const v = input.values,
    d = v.dualBrush;
  return {
    ...input,
    tipScale: d.diameter / Math.max(1, v.diameter),
    stampRole: 'secondary',
    color: '#ffffff',
    flow: 1,
    opacity: 1,
    values: {
      ...v,
      tool: { ...v.tool, type: 'PbTl', pressureOverridesSize: false, pressureOverridesOpacity: false },
      tipKind: d.tipId ? 'sampledBrush' : 'computedBrush',
      spacing: d.spacing,
      spacingEnabled: true,
      flipX: d.flipX,
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

/** Other tool dispatches still require a Photoshop trace; this is not a parity reference. */
function unverifiedToolColor(
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
      tiltX: Math.sin(t * Math.PI * 2) * 45,
      tiltY: 22.5,
      rotation: t * 360,
      time: t * 1000
    };
  });
}
function interpolate(a: PreviewPoint, b: PreviewPoint, t: number): PreviewPoint {
  return {
    pointerType: b.pointerType ?? a.pointerType,
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
