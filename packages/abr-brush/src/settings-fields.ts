import { z } from 'zod/v3';

/** Descriptor bindings also supply labels, ranges and options to the settings panels. */
export const settingGroups = {
  bristle: {
    shape: numericChoice('Shape', 'Brsh.Shp ', [
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
    density: fraction('Bristles', 'Brsh.Dnst', 50),
    length: fraction('Length', 'Brsh.Lngt', 50),
    thickness: fraction('Thickness', 'Brsh.thickness', 10),
    stiffness: fraction('Stiffness', 'Brsh.stiffness', 50),
    clumping: fraction('Clumping', 'Brsh.clumping', 25),
    physics: checkbox('Simulate Bristle Physics', 'Brsh.physics', true)
  },
  erodible: {
    shape: numericChoice('Shape', 'Brsh.Shp ', ['Point', 'Flat', 'Round', 'Square', 'Triangle', 'Custom']),
    softness: percent('Softness', 'Brsh.dtipsHardness', 100),
    length: percent('Length', 'Brsh.dtipsLengthRatio', 100),
    physics: checkbox('Simulate Tip Wear', 'Brsh.physics', true),
    cutoff: number('Cutoff Angle', 'Brsh.dtipsAirbrushCutoffAngle', 0, 90, 15),
    granularity: percent('Granularity', 'Brsh.dtipsAirbrushGranularity', 1),
    streakiness: percent('Spatter Jitter', 'Brsh.dtipsAirbrushStreakiness', 1),
    splatSize: percent('Spatter Size', 'Brsh.dtipsAirbrushSplatSize', 1),
    splatCount: number('Spatter Count', 'Brsh.dtipsAirbrushSplatCount', 1, 1000, 100)
  },
  shapeDynamics: {
    sizeJitter: percent('Size Jitter', 'szVr.jitter'),
    sizeControl: control('Size Control', 'szVr.bVTy', 'size'),
    sizeFade: steps('Size Fade', 'szVr.fStp'),
    sizeMinimum: percent('Control Minimum', 'szVr.Mnm '),
    minimumDiameter: percent('Minimum Diameter', 'minimumDiameter'),
    tiltScale: number('Tilt Scale', 'tiltScale', 0, 200, 200, '#Prc'),
    angleJitter: percent('Angle Jitter', 'angleDynamics.jitter'),
    angleControl: control('Angle Control', 'angleDynamics.bVTy', 'angle'),
    angleFade: steps('Angle Fade', 'angleDynamics.fStp'),
    roundnessJitter: percent('Roundness Jitter', 'roundnessDynamics.jitter'),
    roundnessControl: control('Roundness Control', 'roundnessDynamics.bVTy'),
    roundnessFade: steps('Roundness Fade', 'roundnessDynamics.fStp'),
    roundnessMinimum: percent('Minimum Roundness', 'minimumRoundness', 25),
    flipXJitter: checkbox('Flip X Jitter', 'flipX'),
    flipYJitter: checkbox('Flip Y Jitter', 'flipY'),
    brushProjection: checkbox('Brush Projection', 'brushProjection')
  },
  scattering: {
    scatter: number('Scatter', 'scatterDynamics.jitter', 0, 1000, 0, '#Prc'),
    bothAxes: checkbox('Both Axes', 'bothAxes'),
    control: control('Scatter Control', 'scatterDynamics.bVTy', 'size'),
    fade: steps('Scatter Fade', 'scatterDynamics.fStp'),
    count: number('Count', 'Cnt ', 1, 16, 1),
    countJitter: percent('Count Jitter', 'countDynamics.jitter'),
    countControl: control('Count Control', 'countDynamics.bVTy', 'size'),
    countFade: steps('Count Fade', 'countDynamics.fStp')
  },
  texture: {
    patternId: text('Pattern', 'Txtr.Idnt'),
    patternName: text('Pattern Name', 'Txtr.Nm  '),
    invert: checkbox('Invert', 'InvT'),
    scale: number('Scale', 'textureScale', 1, 1000, 100, '#Prc'),
    brightness: number('Brightness', 'textureBrightness', -150, 150, 0),
    contrast: number('Contrast', 'textureContrast', -50, 100, 0),
    eachTip: checkbox('Texture Each Tip', 'TxtC'),
    mode: choice('Mode', 'textureBlendMode', 'Hght', textureModes),
    depth: percent('Depth', 'textureDepth', 100),
    minimumDepth: percent('Minimum Depth', 'minimumDepth'),
    depthJitter: percent('Depth Jitter', 'textureDepthDynamics.jitter'),
    depthControl: control('Depth Control', 'textureDepthDynamics.bVTy'),
    depthFade: steps('Depth Fade', 'textureDepthDynamics.fStp')
  },
  dualBrush: {
    tipId: text('Second Tip', 'dualBrush.Brsh.sampledData'),
    mode: choice('Mode', 'dualBrush.BlnM', 'Mltp', dualModes),
    flip: checkbox('Flip', 'dualBrush.Flip'),
    diameter: number('Size', 'dualBrush.Brsh.Dmtr', 1, 5000, 30, '#Pxl'),
    spacing: number('Spacing', 'dualBrush.Brsh.Spcn', 1, 1000, 25, '#Prc'),
    angle: number('Angle', 'dualBrush.Brsh.Angl', -180, 180, 0, '#Ang'),
    roundness: number('Roundness', 'dualBrush.Brsh.Rndn', 1, 100, 100, '#Prc'),
    flipX: checkbox('Flip X', 'dualBrush.Brsh.flipX'),
    flipY: checkbox('Flip Y', 'dualBrush.Brsh.flipY'),
    scatter: number('Scatter', 'dualBrush.scatterDynamics.jitter', 0, 1000, 0, '#Prc'),
    bothAxes: checkbox('Both Axes', 'dualBrush.bothAxes'),
    count: number('Count', 'dualBrush.Cnt ', 1, 16, 1)
  },
  colorDynamics: {
    applyPerTip: checkbox('Apply Per Tip', 'colorDynamicsPerTip'),
    foregroundBackgroundJitter: percent('Foreground/Background Jitter', 'clVr.jitter'),
    control: control('Color Control', 'clVr.bVTy'),
    fade: steps('Color Fade', 'clVr.fStp'),
    hueJitter: percent('Hue Jitter', 'H   '),
    saturationJitter: percent('Saturation Jitter', 'Strt'),
    brightnessJitter: percent('Brightness Jitter', 'Brgh'),
    purity: number('Purity', 'purity', -100, 100, 0, '#Prc')
  },
  transfer: {
    opacityJitter: percent('Opacity Jitter', 'prVr.jitter'),
    opacityControl: control('Opacity Control', 'prVr.bVTy', 'size'),
    opacityFade: steps('Opacity Fade', 'prVr.fStp'),
    opacityMinimum: percent('Minimum Opacity', 'prVr.Mnm '),
    flowJitter: percent('Flow Jitter', 'opVr.jitter'),
    flowControl: control('Flow Control', 'opVr.bVTy', 'size'),
    flowFade: steps('Flow Fade', 'opVr.fStp'),
    flowMinimum: percent('Minimum Flow', 'opVr.Mnm '),
    wetnessJitter: percent('Wetness Jitter', 'wtVr.jitter'),
    wetnessControl: control('Wetness Control', 'wtVr.bVTy', 'size'),
    wetnessFade: steps('Wetness Fade', 'wtVr.fStp'),
    wetnessMinimum: percent('Minimum Wetness', 'wtVr.Mnm '),
    mixJitter: percent('Mix Jitter', 'mxVr.jitter'),
    mixControl: control('Mix Control', 'mxVr.bVTy', 'size'),
    mixFade: steps('Mix Fade', 'mxVr.fStp'),
    mixMinimum: percent('Minimum Mix', 'mxVr.Mnm ')
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
  useShapeDynamics: checkbox('Shape Dynamics', 'useTipDynamics'),
  useScattering: checkbox('Scattering', 'useScatter'),
  useTexture: checkbox('Texture', 'useTexture'),
  useDualBrush: checkbox('Dual Brush', 'dualBrush.useDualBrush'),
  useColorDynamics: checkbox('Color Dynamics', 'useColorDynamics'),
  useTransfer: checkbox('Transfer', 'usePaintDynamics'),
  useBrushPose: checkbox('Brush Pose', 'useBrushPose'),
  useNoise: checkbox('Noise', 'Nose'),
  useWetEdges: checkbox('Wet Edges', 'Wtdg'),
  useBuildUp: checkbox('Build-up', 'Rpt '),
  useSmoothing: checkbox('Smoothing', 'toolOptions.smoothing', true),
  useProtectTexture: checkbox('Protect Texture', 'protectTexture')
};

/** A field retains its exact scalar type through schema generation. */
export type SettingField<S extends z.ZodType = z.ZodType> = {
  schema: S;
  label: string;
  path: string;
  initial: z.input<S>;
  kind: 'number' | 'boolean' | 'control' | 'choice' | 'text';
  factor?: number;
  min?: number;
  max?: number;
  unit?: string;
  options?: readonly { value: number | string; label: string }[];
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
function dualModes(): readonly [string, string][] {
  return [...textureModes(), ['linearDodge', 'Linear Dodge (Add)'], ['Dfrn', 'Difference']];
}

function fraction(label: string, path: string, initial: number): SettingField<z.ZodNumber> {
  return { ...percent(label, path, initial), factor: 100 };
}
function numericChoice(label: string, path: string, labels: string[]): SettingField<z.ZodNumber> {
  return {
    ...number(label, path, 0, labels.length - 1, 0),
    kind: 'control',
    options: labels.map((label, value) => ({ label, value }))
  };
}
