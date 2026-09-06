import { z } from 'zod/v3';
import type { BrushWithPreview } from '../../lib/abr';
import { extractPercent } from './helper-functions/extractPercent';

// Control type enum values (matches ControlSelect options)
export const controlTypeSchema = z.number().min(0).max(5);

// Main brush form schema
export const brushFormSchema = z.object({
  // Core properties
  name: z.string().min(1, 'Name is required'),
  spacing: z.number().min(1).max(1000),
  diameter: z.number().min(1).max(5000),
  angle: z.number().min(-180).max(180),
  roundness: z.number().min(0).max(100),
  hardness: z.number().min(0).max(100),
  flipX: z.boolean(),
  flipY: z.boolean(),

  // Feature toggles
  useShapeDynamics: z.boolean(),
  useScattering: z.boolean(),
  useTexture: z.boolean(),
  useDualBrush: z.boolean(),
  useColorDynamics: z.boolean(),
  useTransfer: z.boolean(),
  useBrushPose: z.boolean(),
  useNoise: z.boolean(),
  useWetEdges: z.boolean(),
  useBuildUp: z.boolean(),
  useSmoothing: z.boolean(),
  useProtectTexture: z.boolean(),

  // Shape Dynamics
  shapeDynamics: z.object({
    sizeJitter: z.number().min(0).max(100),
    sizeControl: controlTypeSchema,
    sizeMinimum: z.number().min(0).max(100),
    minimumDiameter: z.number().min(0).max(100),
    tiltScale: z.number().min(0).max(200),
    angleJitter: z.number().min(0).max(360),
    angleControl: controlTypeSchema,
    roundnessJitter: z.number().min(0).max(100),
    roundnessControl: controlTypeSchema,
    roundnessMinimum: z.number().min(0).max(100),
    flipXJitter: z.boolean(),
    flipYJitter: z.boolean(),
    brushProjection: z.boolean()
  }),

  // Scattering
  scattering: z.object({
    scatter: z.number().min(0).max(1000),
    bothAxes: z.boolean(),
    control: controlTypeSchema,
    count: z.number().min(1).max(16),
    countJitter: z.number().min(0).max(100),
    countControl: controlTypeSchema
  }),

  // Transfer
  transfer: z.object({
    opacityJitter: z.number().min(0).max(100),
    opacityControl: controlTypeSchema,
    opacityMinimum: z.number().min(0).max(100),
    flowJitter: z.number().min(0).max(100),
    flowControl: controlTypeSchema,
    flowMinimum: z.number().min(0).max(100)
  })
});

export type BrushFormValues = z.infer<typeof brushFormSchema>;

/**
 * Converts a BrushWithPreview to form values
 */
export function brushToFormValues(brush: BrushWithPreview): BrushFormValues {
  const settings = brush.settings || {};
  const brushDef = (settings.Brsh as Record<string, unknown>) || {};

  // Extract shape dynamics
  const szVr = settings.szVr as Record<string, unknown> | undefined;
  const angleDynamics = settings.angleDynamics as Record<string, unknown> | undefined;
  const roundnessDynamics = settings.roundnessDynamics as Record<string, unknown> | undefined;

  // Extract scattering
  const scatterSettings = settings.scatter as Record<string, unknown> | undefined;
  const countDynamics = settings.countDynamics as Record<string, unknown> | undefined;

  // Extract transfer
  const opacityDynamics = settings.opacityDynamics as Record<string, unknown> | undefined;
  const flowDynamics = settings.flowDynamics as Record<string, unknown> | undefined;

  return {
    // Core properties
    name: brush.name,
    spacing: brush.spacing ?? 25,
    diameter: brush.diameter ?? 30,
    angle: brush.angle ?? 0,
    roundness: brush.roundness ?? 100,
    hardness: brush.hardness ?? 100,
    flipX: brushDef.flipX === true,
    flipY: brushDef.flipY === true,

    // Feature toggles
    useShapeDynamics: settings.useTipDynamics === true,
    useScattering: settings.useScatter === true,
    useTexture: settings.useTexture === true,
    useDualBrush: false,
    useColorDynamics: settings.useColorDynamics === true,
    useTransfer: settings.usePaintDynamics === true,
    useBrushPose: settings.useBrushPose === true,
    useNoise: settings.useNoise === true,
    useWetEdges: settings.Wtdg === true,
    useBuildUp: settings.useBuildUp === true,
    useSmoothing: settings.useSmoothing === true,
    useProtectTexture: settings.useProtectTexture === true,

    // Shape Dynamics
    shapeDynamics: {
      sizeJitter: extractPercent(szVr?.jitter),
      sizeControl: (szVr?.bVTy as number) || 0,
      sizeMinimum: extractPercent(szVr?.['Mnm '] || szVr?.Mnm),
      minimumDiameter: extractPercent(settings.minimalDiameter),
      tiltScale: extractPercent(settings.tiltScale) || 100,
      angleJitter: extractPercent(angleDynamics?.jitter),
      angleControl: (angleDynamics?.bVTy as number) || 0,
      roundnessJitter: extractPercent(roundnessDynamics?.jitter),
      roundnessControl: (roundnessDynamics?.bVTy as number) || 0,
      roundnessMinimum: extractPercent(roundnessDynamics?.['Mnm '] || roundnessDynamics?.Mnm) || 25,
      flipXJitter: settings.flipX === true,
      flipYJitter: settings.flipY === true,
      brushProjection: settings.brushProjection === true
    },

    // Scattering
    scattering: {
      scatter: extractPercent(scatterSettings?.Sctr),
      bothAxes: scatterSettings?.bothAxes === true,
      control: (scatterSettings?.bVTy as number) || 0,
      count: (scatterSettings?.['Cnt '] as number) || 1,
      countJitter: extractPercent(countDynamics?.jitter),
      countControl: (countDynamics?.bVTy as number) || 0
    },

    // Transfer
    transfer: {
      opacityJitter: extractPercent(opacityDynamics?.jitter),
      opacityControl: (opacityDynamics?.bVTy as number) || 0,
      opacityMinimum: extractPercent(opacityDynamics?.['Mnm '] || opacityDynamics?.Mnm),
      flowJitter: extractPercent(flowDynamics?.jitter),
      flowControl: (flowDynamics?.bVTy as number) || 0,
      flowMinimum: extractPercent(flowDynamics?.['Mnm '] || flowDynamics?.Mnm)
    }
  };
}

/**
 * Converts form values back to BrushWithPreview for saving
 */
export function formValuesToBrush(brush: BrushWithPreview, values: BrushFormValues): BrushWithPreview {
  // Start with original settings to preserve all fields
  const updatedSettings = { ...brush.settings };

  // Update feature toggles
  updatedSettings.useTipDynamics = values.useShapeDynamics;
  updatedSettings.useScatter = values.useScattering;
  updatedSettings.useTexture = values.useTexture;
  updatedSettings.useColorDynamics = values.useColorDynamics;
  updatedSettings.usePaintDynamics = values.useTransfer;
  updatedSettings.useBrushPose = values.useBrushPose;
  updatedSettings.useNoise = values.useNoise;
  updatedSettings.Wtdg = values.useWetEdges;
  updatedSettings.useBuildUp = values.useBuildUp;
  updatedSettings.useSmoothing = values.useSmoothing;
  updatedSettings.useProtectTexture = values.useProtectTexture;
  updatedSettings.flipX = values.shapeDynamics.flipXJitter;
  updatedSettings.flipY = values.shapeDynamics.flipYJitter;
  updatedSettings.brushProjection = values.shapeDynamics.brushProjection;

  // Shape dynamics
  if (values.useShapeDynamics) {
    updatedSettings.szVr = {
      ...((updatedSettings.szVr as Record<string, unknown>) || {}),
      jitter: { unit: '#Prc', value: values.shapeDynamics.sizeJitter },
      bVTy: values.shapeDynamics.sizeControl,
      'Mnm ': { unit: '#Prc', value: values.shapeDynamics.sizeMinimum }
    };
    updatedSettings.angleDynamics = {
      ...((updatedSettings.angleDynamics as Record<string, unknown>) || {}),
      jitter: { unit: '#Ang', value: values.shapeDynamics.angleJitter },
      bVTy: values.shapeDynamics.angleControl
    };
    updatedSettings.roundnessDynamics = {
      ...((updatedSettings.roundnessDynamics as Record<string, unknown>) || {}),
      jitter: { unit: '#Prc', value: values.shapeDynamics.roundnessJitter },
      bVTy: values.shapeDynamics.roundnessControl,
      'Mnm ': { unit: '#Prc', value: values.shapeDynamics.roundnessMinimum }
    };
  }
  updatedSettings.minimumDiameter = { unit: '#Prc', value: values.shapeDynamics.minimumDiameter };
  updatedSettings.tiltScale = { unit: '#Prc', value: values.shapeDynamics.tiltScale };

  // Scattering
  if (values.useScattering) {
    updatedSettings.scatter = {
      ...((updatedSettings.scatter as Record<string, unknown>) || {}),
      Sctr: { unit: '#Prc', value: values.scattering.scatter },
      bothAxes: values.scattering.bothAxes,
      bVTy: values.scattering.control,
      'Cnt ': values.scattering.count
    };
    updatedSettings.countDynamics = {
      ...((updatedSettings.countDynamics as Record<string, unknown>) || {}),
      jitter: { unit: '#Prc', value: values.scattering.countJitter },
      bVTy: values.scattering.countControl
    };
  }

  // Transfer
  if (values.useTransfer) {
    updatedSettings.opacityDynamics = {
      ...((updatedSettings.opacityDynamics as Record<string, unknown>) || {}),
      jitter: { unit: '#Prc', value: values.transfer.opacityJitter },
      bVTy: values.transfer.opacityControl,
      'Mnm ': { unit: '#Prc', value: values.transfer.opacityMinimum }
    };
    updatedSettings.flowDynamics = {
      ...((updatedSettings.flowDynamics as Record<string, unknown>) || {}),
      jitter: { unit: '#Prc', value: values.transfer.flowJitter },
      bVTy: values.transfer.flowControl,
      'Mnm ': { unit: '#Prc', value: values.transfer.flowMinimum }
    };
  }

  return {
    ...brush,
    name: values.name,
    spacing: values.spacing,
    diameter: values.diameter,
    angle: values.angle,
    roundness: values.roundness,
    hardness: brush.type === 'computed' ? values.hardness : brush.hardness,
    settings: updatedSettings
  };
}
