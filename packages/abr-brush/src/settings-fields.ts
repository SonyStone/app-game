import { z } from 'zod/v3';

/** Descriptor bindings also supply labels, ranges and options to the settings panels. */
export const settingGroups = {
  tool: {
    type: plainChoice('Tool', 'toolOptions.kind', 'PbTl', [
      ['PbTl', 'Brush'],
      ['PcTl', 'Pencil'],
      ['ErTl', 'Eraser'],
      ['SmTl', 'Smudge'],
      ['MixB', 'Mixer Brush'],
      ['ShTl', 'Sharpen'],
      ['BlTl', 'Blur']
    ]),
    mode: choice('Mode', 'toolOptions.mode', 'Nrml', paintToolModes),
    opacity: number('Opacity (%)', 'toolOptions.opacity', 0, 100, 100),
    flow: number('Flow (%)', 'toolOptions.flow', 0, 100, 100),
    foreground: color('Saved foreground', 'toolOptions.foregroundColor'),
    background: color('Saved background', 'toolOptions.backgroundColor'),
    pressureOverridesOpacity: checkbox('Always use pressure for opacity', 'toolOptions.usePressureOverridesOpacity'),
    pressureOverridesSize: checkbox('Always use pressure for size', 'toolOptions.usePressureOverridesSize'),
    pressureSmoothing: checkbox('Smooth pressure (stored only)', 'toolOptions.pressureSmoothing'),
    legacy: checkbox('Legacy mode (stored only)', 'toolOptions.useLegacy'),
    strength: number('Strength (%)', 'toolOptions.strength', 0, 100, 50),
    fingerPainting: checkbox('Finger Painting', 'toolOptions.fingerPainting'),
    smudgeAllLayers: checkbox('Sample All Layers', 'toolOptions.smudgeAllLayers'),
    wetness: number('Wet (%)', 'toolOptions.wetness', 0, 100, 0),
    load: number('Load (%)', 'toolOptions.dryness', 0, 100, 100),
    mix: number('Mix (%)', 'toolOptions.mix', 0, 100, 0),
    autoFill: checkbox('Load brush after each stroke', 'toolOptions.autoFill', true),
    autoClean: checkbox('Clean brush after each stroke', 'toolOptions.autoClean'),
    loadSolidColorOnly: checkbox('Load solid colors only', 'toolOptions.loadSolidColorOnly', true),
    sampleAllLayers: checkbox('Sample All Layers', 'toolOptions.sampleAllLayers'),
    autoErase: checkbox('Auto Erase', 'toolOptions.autoErase'),
    eraseToHistory: checkbox('Erase to History', 'toolOptions.eraseToHistory'),
    eraserMode: numericChoice('Eraser Mode', 'toolOptions.eraserMode', ['Brush', 'Pencil', 'Block'], 1),
    sharpenAllLayers: checkbox('Sample All Layers', 'toolOptions.filterAllLayers'),
    protectDetail: checkbox('Protect Detail', 'toolOptions.detailBoost', true)
  },
  bristle: {
    shape: numericChoice('Shape', 'tip.shape', [
      'Round Point',
      'Round Blunt',
      'Round Curve',
      'Round Angle',
      'Round Fan',
      'Flat Point',
      'Flat Blunt',
      'Flat Curve',
      'Flat Angle',
      'Flat Fan'
    ]),
    density: fraction('Bristles', 'tip.density', 50),
    length: fraction('Length', 'tip.length', 50),
    thickness: fraction('Thickness', 'tip.thickness', 10),
    stiffness: fraction('Stiffness', 'tip.stiffness', 50),
    clumping: fraction('Clumping', 'tip.clumping', 25),
    physics: checkbox('Simulate Bristle Physics', 'tip.physics', true)
  },
  erodible: {
    shape: numericChoice('Shape', 'tip.shape', ['Point', 'Flat', 'Round', 'Square', 'Triangle', 'Custom']),
    softness: percent('Softness', 'tip.dtipsHardness', 100),
    length: percent('Length', 'tip.dtipsLengthRatio', 100),
    physics: checkbox('Simulate Tip Wear', 'tip.physics', true),
    cutoff: number('Cutoff Angle', 'tip.dtipsAirbrushCutoffAngle', 0, 90, 15),
    granularity: percent('Granularity', 'tip.dtipsAirbrushGranularity', 1),
    streakiness: percent('Spatter Jitter', 'tip.dtipsAirbrushStreakiness', 1),
    splatSize: percent('Spatter Size', 'tip.dtipsAirbrushSplatSize', 1),
    splatCount: number('Spatter Count', 'tip.dtipsAirbrushSplatCount', 1, 1000, 100)
  },
  shapeDynamics: {
    sizeJitter: percent('Size Jitter', 'sizeDynamics.jitter'),
    sizeControl: control('Size Control', 'sizeDynamics.control', 'size'),
    sizeFade: steps('Size Fade', 'sizeDynamics.fadeSteps'),
    sizeMinimum: percent('Control Minimum', 'sizeDynamics.minimum'),
    minimumDiameter: percent('Minimum Diameter', 'minimumDiameter'),
    tiltScale: number('Tilt Scale', 'tiltScale', 0, 200, 200, '#Prc'),
    angleJitter: percent('Angle Jitter', 'angleDynamics.jitter'),
    angleControl: control('Angle Control', 'angleDynamics.control', 'angle'),
    angleFade: steps('Angle Fade', 'angleDynamics.fadeSteps'),
    roundnessJitter: percent('Roundness Jitter', 'roundnessDynamics.jitter'),
    roundnessControl: control('Roundness Control', 'roundnessDynamics.control'),
    roundnessFade: steps('Roundness Fade', 'roundnessDynamics.fadeSteps'),
    roundnessControlMinimum: {
      ...percent('Control Minimum', 'roundnessDynamics.minimum'),
      schema: z.number().finite().min(0).max(100).default(0)
    },
    roundnessMinimum: percent('Minimum Roundness', 'minimumRoundness', 25),
    flipXJitter: checkbox('Flip X Jitter', 'flipX'),
    flipYJitter: checkbox('Flip Y Jitter', 'flipY'),
    brushProjection: checkbox('Brush Projection', 'brushProjection')
  },
  scattering: {
    scatter: number('Scatter', 'scatterDynamics.jitter', 0, 1000, 0, '#Prc'),
    bothAxes: checkbox('Both Axes', 'bothAxes'),
    control: control('Scatter Control', 'scatterDynamics.control', 'size'),
    fade: steps('Scatter Fade', 'scatterDynamics.fadeSteps'),
    count: number('Count', 'count', 1, 16, 1),
    countJitter: percent('Count Jitter', 'countDynamics.jitter'),
    countControl: control('Count Control', 'countDynamics.control', 'size'),
    countFade: steps('Count Fade', 'countDynamics.fadeSteps')
  },
  texture: {
    patternId: text('Pattern', 'texture.identifier'),
    patternName: text('Pattern Name', 'texture.name'),
    invert: checkbox('Invert', 'invertTexture'),
    scale: number('Scale', 'textureScale', 1, 1000, 100, '#Prc'),
    brightness: number('Brightness', 'textureBrightness', -150, 150, 0),
    contrast: number('Contrast', 'textureContrast', -50, 100, 0),
    eachTip: checkbox('Texture Each Tip', 'textureEachTip'),
    mode: choice('Mode', 'textureBlendMode', 'Hght', textureModes),
    depth: percent('Depth', 'textureDepth', 100),
    minimumDepth: percent('Minimum Depth', 'minimumDepth'),
    depthJitter: percent('Depth Jitter', 'textureDepthDynamics.jitter'),
    depthControl: control('Depth Control', 'textureDepthDynamics.control'),
    depthFade: steps('Depth Fade', 'textureDepthDynamics.fadeSteps')
  },
  dualBrush: {
    tipId: text('Second Tip', 'dualBrush.tip.sampleId'),
    mode: choice('Mode', 'dualBrush.blendMode', 'Mltp', dualModes),
    flip: checkbox('Flip', 'dualBrush.flip'),
    diameter: number('Size', 'dualBrush.tip.diameter', 1, 5000, 30, '#Pxl'),
    hardness: {
      ...number('Hardness', 'dualBrush.tip.hardness', 0, 100, 100, '#Prc'),
      schema: z.number().finite().min(0).max(100).default(100)
    },
    spacing: number('Spacing', 'dualBrush.tip.spacing', 1, 1000, 25, '#Prc'),
    angle: number('Angle', 'dualBrush.tip.angle', -180, 180, 0, '#Ang'),
    roundness: number('Roundness', 'dualBrush.tip.roundness', 1, 100, 100, '#Prc'),
    flipX: checkbox('Flip X', 'dualBrush.tip.flipX'),
    flipY: checkbox('Flip Y', 'dualBrush.tip.flipY'),
    scatter: number('Scatter', 'dualBrush.scatterDynamics.jitter', 0, 1000, 0, '#Prc'),
    bothAxes: checkbox('Both Axes', 'dualBrush.bothAxes'),
    count: number('Count', 'dualBrush.count', 1, 16, 1)
  },
  colorDynamics: {
    applyPerTip: checkbox('Apply Per Tip', 'colorDynamicsPerTip'),
    foregroundBackgroundJitter: percent('Foreground/Background Jitter', 'colorDynamics.jitter'),
    control: control('Color Control', 'colorDynamics.control'),
    fade: steps('Color Fade', 'colorDynamics.fadeSteps'),
    hueJitter: percent('Hue Jitter', 'hue'),
    saturationJitter: percent('Saturation Jitter', 'saturation'),
    brightnessJitter: percent('Brightness Jitter', 'brightness'),
    purity: number('Purity', 'purity', -100, 100, 0, '#Prc')
  },
  transfer: {
    // Photoshop's prVr is flow; opVr is opacity. Keep both read and write paths
    // aligned with the wire format, not inferred from a preset's appearance.
    opacityJitter: percent('Opacity Jitter', 'opacityDynamics.jitter'),
    opacityControl: control('Opacity Control', 'opacityDynamics.control', 'size'),
    opacityFade: steps('Opacity Fade', 'opacityDynamics.fadeSteps'),
    opacityMinimum: percent('Minimum Opacity', 'opacityDynamics.minimum'),
    flowJitter: percent('Flow Jitter', 'flowDynamics.jitter'),
    flowControl: control('Flow Control', 'flowDynamics.control', 'size'),
    flowFade: steps('Flow Fade', 'flowDynamics.fadeSteps'),
    flowMinimum: percent('Minimum Flow', 'flowDynamics.minimum'),
    wetnessJitter: percent('Wetness Jitter', 'wetnessDynamics.jitter'),
    wetnessControl: control('Wetness Control', 'wetnessDynamics.control', 'size'),
    wetnessFade: steps('Wetness Fade', 'wetnessDynamics.fadeSteps'),
    wetnessMinimum: percent('Minimum Wetness', 'wetnessDynamics.minimum'),
    mixJitter: percent('Mix Jitter', 'mixDynamics.jitter'),
    mixControl: control('Mix Control', 'mixDynamics.control', 'size'),
    mixFade: steps('Mix Fade', 'mixDynamics.fadeSteps'),
    mixMinimum: percent('Minimum Mix', 'mixDynamics.minimum')
  },
  brushPose: {
    tiltX: number('Tilt X', 'brushPoseTiltX', -100, 100, 0),
    overrideTiltX: checkbox('Override Tilt X', 'overridePoseTiltX'),
    tiltY: number('Tilt Y', 'brushPoseTiltY', -100, 100, 0),
    overrideTiltY: checkbox('Override Tilt Y', 'overridePoseTiltY'),
    rotation: number('Rotation', 'brushPoseAngle', 0, 360, 0),
    overrideRotation: checkbox('Override Rotation', 'overridePoseAngle'),
    pressure: percent('Pressure', 'brushPosePressure', 100),
    overridePressure: checkbox('Override Pressure', 'overridePosePressure')
  },
  smoothing: {
    amount: number('Smoothing', 'toolOptions.smoothingValue', 0, 100, 0),
    pulledString: checkbox('Pulled String Mode', 'toolOptions.smoothingRadiusMode'),
    catchUp: checkbox('Stroke Catch-up', 'toolOptions.smoothingCatchup', true),
    catchUpAtEnd: checkbox('Catch-up on Stroke End', 'toolOptions.smoothingCatchupAtEnd'),
    adjustForZoom: checkbox('Adjust for Zoom', 'toolOptions.smoothingZoomCompensation', true)
  }
};

/** Feature switches use Photoshop's wire names, including nested Dual Brush and tool smoothing. */
export const featureFields = {
  useShapeDynamics: checkbox('Shape Dynamics', 'shapeDynamicsEnabled'),
  useScattering: checkbox('Scattering', 'scatteringEnabled'),
  useTexture: checkbox('Texture', 'textureEnabled'),
  useDualBrush: checkbox('Dual Brush', 'dualBrush.enabled'),
  useColorDynamics: checkbox('Color Dynamics', 'useColorDynamics'),
  useTransfer: checkbox('Transfer', 'transferEnabled'),
  useBrushPose: checkbox('Brush Pose', 'useBrushPose'),
  useNoise: checkbox('Noise', 'noiseEnabled'),
  useWetEdges: checkbox('Wet Edges', 'wetEdgesEnabled'),
  useBuildUp: checkbox('Build-up', 'buildUpEnabled'),
  useSmoothing: checkbox('Smoothing', 'toolOptions.smoothing', true),
  useProtectTexture: checkbox('Protect Texture', 'protectTexture')
};

/** A field retains its exact scalar type through schema generation. */
export type SettingField<S extends z.ZodType = z.ZodType> = {
  schema: S;
  label: string;
  path: string;
  initial: z.input<S>;
  kind: 'number' | 'boolean' | 'control' | 'choice' | 'text' | 'color';
  factor?: number;
  min?: number;
  max?: number;
  unit?: string;
  options?: readonly { value: number | string; label: string }[];
  /** Choices such as tool class IDs are plain descriptor strings, not enumerated values. */
  plain?: boolean;
};

/** Derives a strict form schema from the same bindings used for import and export. */
export function fieldsSchema<T extends Record<string, SettingField>>(fields: T) {
  return z.object(
    Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.schema])) as {
      [K in keyof T]: T[K]['schema'];
    }
  );
}

function number(
  label: string,
  path: string,
  min: number,
  max: number,
  initial: number,
  unit?: string
): SettingField<z.ZodNumber> {
  return { label, path, min, max, initial, unit, kind: 'number', schema: z.number().finite().min(min).max(max) };
}
function percent(label: string, path: string, initial = 0) {
  return number(label, path, 0, 100, initial, '#Prc');
}
function steps(label: string, path: string) {
  const field = number(label, path, 1, 9999, 25);
  return { ...field, schema: field.schema.int() };
}
function checkbox(label: string, path: string, initial = false): SettingField<z.ZodBoolean> {
  return { label, path, initial, kind: 'boolean', schema: z.boolean() };
}
function text(label: string, path: string): SettingField<z.ZodString> {
  return { label, path, initial: '', kind: 'text', schema: z.string() };
}
function control(
  label: string,
  path: string,
  type: 'size' | 'angle' | 'general' = 'general'
): SettingField<z.ZodNumber> {
  const options = [
    { value: 0, label: 'Off' },
    { value: 1, label: 'Fade' },
    { value: 8, label: 'Dial' },
    { value: 2, label: 'Pen Pressure' },
    { value: 3, label: 'Pen Tilt' },
    { value: 4, label: 'Stylus Wheel' },
    ...(type !== 'size' ? [{ value: 7, label: 'Rotation' }] : []),
    ...(type === 'angle'
      ? [
          { value: 5, label: 'Initial Direction' },
          { value: 6, label: 'Direction' }
        ]
      : [])
  ];
  return { ...number(label, path, 0, 8, 0), kind: 'control', options };
}
function choice(
  label: string,
  path: string,
  initial: string,
  modes: () => readonly [string, string][]
): SettingField<z.ZodString> {
  return {
    label,
    path,
    initial,
    kind: 'choice',
    schema: z.string(),
    options: modes().map(([value, label]) => ({ value, label }))
  };
}
function textureModes(): readonly [string, string][] {
  return [
    ['Mltp', 'Multiply'],
    ['Sbtr', 'Subtract'],
    ['Drkn', 'Darken'],
    ['Ovrl', 'Overlay'],
    ['CDdg', 'Color Dodge'],
    ['CBrn', 'Color Burn'],
    ['linearBurn', 'Linear Burn'],
    ['hardMix', 'Hard Mix'],
    ['linearHeight', 'Linear Height'],
    ['Hght', 'Height']
  ];
}

function plainChoice(label: string, path: string, initial: string, options: [string, string][]) {
  return { ...choice(label, path, initial, () => options), plain: true };
}

/** Paint-tool blend modes; independent of texture and secondary-tip modes. */
function paintToolModes(): readonly [string, string][] {
  return [
    ['Nrml', 'Normal'],
    ['Dslv', 'Dissolve'],
    ['Bhnd', 'Behind'],
    ['Cler', 'Clear'],
    ['Drkn', 'Darken'],
    ['Mltp', 'Multiply'],
    ['CBrn', 'Color Burn'],
    ['linearBurn', 'Linear Burn'],
    ['darkerColor', 'Darker Color'],
    ['Lghn', 'Lighten'],
    ['Scrn', 'Screen'],
    ['CDdg', 'Color Dodge'],
    ['linearDodge', 'Linear Dodge (Add)'],
    ['lighterColor', 'Lighter Color'],
    ['Ovrl', 'Overlay'],
    ['SftL', 'Soft Light'],
    ['HrdL', 'Hard Light'],
    ['vividLight', 'Vivid Light'],
    ['linearLight', 'Linear Light'],
    ['pinLight', 'Pin Light'],
    ['hardMix', 'Hard Mix'],
    ['Dfrn', 'Difference'],
    ['Xclu', 'Exclusion'],
    ['Sbtr', 'Subtract'],
    ['divide', 'Divide'],
    ['hue', 'Hue'],
    ['saturation', 'Saturation'],
    ['Clr ', 'Color'],
    ['Lmns', 'Luminosity']
  ];
}
function dualModes(): readonly [string, string][] {
  return [...textureModes(), ['linearDodge', 'Linear Dodge (Add)'], ['Dfrn', 'Difference']];
}

function fraction(label: string, path: string, initial: number): SettingField<z.ZodNumber> {
  return { ...percent(label, path, initial), factor: 100 };
}
function numericChoice(label: string, path: string, labels: string[], first = 0): SettingField<z.ZodNumber> {
  return {
    ...number(label, path, first, first + labels.length - 1, first),
    kind: 'control',
    options: labels.map((label, index) => ({ label, value: first + index }))
  };
}

/** An empty color inherits the host color rather than saving a default into the preset. */
function color(label: string, path: string): SettingField<z.ZodString> {
  return { label, path, initial: '', kind: 'color', schema: z.string().regex(/^(?:#[0-9a-fA-F]{6})?$/) };
}

/** Smudge exposes color replacement modes, rather than the full paint-tool mode list. */
export const smudgeModes = ['Nrml', 'Drkn', 'Lghn', 'hue', 'saturation', 'Clr ', 'Lmns'] as const;
