/**
 * ABR Descriptor Keys Mapping
 *
 * This file documents the Photoshop descriptor keys used in ABR files
 * and their corresponding human-readable names.
 *
 * ABR files use a binary descriptor format where settings are stored
 * with 4-character keys (often with trailing spaces).
 */

// ============================================================================
// MARK: Brush Definition Keys (inside 'Brsh' object)
// ============================================================================

export const BrushDefinitionKeys = {
  /** Brush type enum: 'brtC' = computed, 'brtS' = sampled */
  brTp: 'brushType',

  /** Diameter in pixels (UntF #Pxl) */
  Dmtr: 'diameter',

  /** Hardness percentage (UntF #Prc) - only for computed brushes */
  Hrdn: 'hardness',

  /** Brush tip angle in degrees (UntF #Ang) - Range: -179 to 180 */
  Angl: 'angle',

  /** Roundness percentage (UntF #Prc) */
  Rndn: 'roundness',

  /** Spacing percentage (UntF #Prc) */
  Spcn: 'spacing',

  /** Interpolation enabled (bool) */
  Intr: 'interpolation',

  /** Flip X (bool) */
  flipX: 'flipX',

  /** Flip Y (bool) */
  flipY: 'flipY',

  /** UUID reference to sampled brush tip data (TEXT) */
  sampledData: 'sampledDataUuid'
} as const;

// ============================================================================
// MARK: Top-Level Brush Preset Keys
// ============================================================================

export const BrushPresetKeys = {
  /** Brush name (TEXT) */
  'Nm  ': 'name',

  /** Brush definition object (Objc: computedBrush | sampledBrush) */
  Brsh: 'brushDefinition',

  /** Brush identifier/UUID (TEXT) */
  Idnt: 'identifier',

  /** Use brush size from preset (bool) */
  useBrushSize: 'useBrushSize',

  /** Use brush group (bool) */
  useBrushGroup: 'useBrushGroup'
} as const;

// ============================================================================
// MARK: Shape Dynamics Keys
// ============================================================================

export const ShapeDynamicsKeys = {
  /** Shape dynamics enabled (bool) */
  useTipDynamics: 'shapeDynamicsEnabled',

  /** Size jitter percentage (UntF #Prc) */
  szJt: 'sizeJitter',

  /** Size jitter control type (enum: strokeDynamicsType) */
  sizeJitterControl: 'sizeJitterControl',

  /** Minimum diameter percentage (UntF #Prc) */
  minDiameter: 'minimumDiameter',

  /** Tilt scale percentage (UntF #Prc) */
  tiltScale: 'tiltScale',

  /** Angle jitter percentage (UntF #Prc) */
  anglJitter: 'angleJitter',

  /** Angle jitter control (enum) */
  anglJitterControl: 'angleJitterControl',

  /** Roundness jitter percentage (UntF #Prc) */
  rndnJitter: 'roundnessJitter',

  /** Roundness jitter control (enum) */
  rndnJitterControl: 'roundnessJitterControl',

  /** Minimum roundness percentage (UntF #Prc) */
  minRoundness: 'minimumRoundness',

  /** Flip X jitter (bool) */
  flipXJitter: 'flipXJitter',

  /** Flip Y jitter (bool) */
  flipYJitter: 'flipYJitter',

  /** Brush projection enabled (bool) */
  brushProjection: 'brushProjection'
} as const;

// ============================================================================
// MARK: Scattering Keys
// ============================================================================

export const ScatteringKeys = {
  /** Scattering enabled (bool) */
  useScatter: 'scatteringEnabled',

  /** Scatter amount percentage (UntF #Prc) */
  scatter: 'scatter',

  /** Scatter control (enum) */
  scatterControl: 'scatterControl',

  /** Both axes enabled (bool) */
  bothAxes: 'bothAxes',

  /** Brush count (long) */
  count: 'count',

  /** Count jitter percentage (UntF #Prc) */
  countJitter: 'countJitter',

  /** Count jitter control (enum) */
  countJitterControl: 'countJitterControl'
} as const;

// ============================================================================
// MARK: Texture Keys
// ============================================================================

export const TextureKeys = {
  /** Texture enabled (bool) */
  useTexture: 'textureEnabled',

  /** Pattern reference (Objc: pattern) */
  Ptrn: 'pattern',

  /** Texture scale percentage (UntF #Prc) */
  textureScale: 'scale',

  /** Texture brightness (long: -150 to 150) */
  textureBrightness: 'brightness',

  /** Texture contrast (long: -50 to 100) */
  textureContrast: 'contrast',

  /** Texture depth percentage (UntF #Prc) */
  textureDepth: 'depth',

  /** Texture each tip (bool) */
  textureEachTip: 'textureEachTip',

  /** Texture blend mode (enum: blendMode) */
  textureBlendMode: 'blendMode',

  /** Minimum depth percentage (UntF #Prc) */
  minimumTextureDepth: 'minimumDepth',

  /** Depth jitter percentage (UntF #Prc) */
  textureDepthJitter: 'depthJitter',

  /** Depth jitter control (enum) */
  textureDepthJitterControl: 'depthJitterControl',

  /** Invert texture (bool) */
  invertTexture: 'invert'
} as const;

// ============================================================================
// MARK: Dual Brush Keys
// ============================================================================

export const DualBrushKeys = {
  /** Dual brush enabled (bool) */
  useDualBrush: 'dualBrushEnabled',

  /** Dual brush definition (Objc: brush) */
  dualBrush: 'dualBrush',

  /** Dual brush blend mode (enum: blendMode) */
  dualBrushBlendMode: 'blendMode',

  /** Dual brush flip (bool) */
  dualBrushFlip: 'flip',

  /** Dual brush size (UntF #Pxl) */
  dualBrushSize: 'size',

  /** Dual brush spacing percentage (UntF #Prc) */
  dualBrushSpacing: 'spacing',

  /** Dual brush scatter percentage (UntF #Prc) */
  dualBrushScatter: 'scatter',

  /** Dual brush both axes (bool) */
  dualBrushBothAxes: 'bothAxes',

  /** Dual brush count (long) */
  dualBrushCount: 'count'
} as const;

// ============================================================================
// MARK: Color Dynamics Keys
// ============================================================================

export const ColorDynamicsKeys = {
  /** Color dynamics enabled (bool) */
  useColorDynamics: 'colorDynamicsEnabled',

  /** Apply per tip (bool) */
  applyPerTip: 'applyPerTip',

  /** Foreground/background jitter percentage (UntF #Prc) */
  fgBgJitter: 'foregroundBackgroundJitter',

  /** Foreground/background jitter control (enum) */
  fgBgJitterControl: 'foregroundBackgroundJitterControl',

  /** Hue jitter percentage (UntF #Prc) */
  hueJitter: 'hueJitter',

  /** Saturation jitter percentage (UntF #Prc) */
  satJitter: 'saturationJitter',

  /** Brightness jitter percentage (UntF #Prc) */
  briJitter: 'brightnessJitter',

  /** Purity (long: -100 to 100) */
  purity: 'purity'
} as const;

// ============================================================================
// MARK: Transfer Keys (Opacity/Flow Dynamics)
// ============================================================================

export const TransferKeys = {
  /** Transfer enabled (bool) */
  usePaintDynamics: 'transferEnabled',

  /** Opacity jitter percentage (UntF #Prc) */
  opacityJitter: 'opacityJitter',

  /** Opacity jitter control (enum) */
  opacityJitterControl: 'opacityJitterControl',

  /** Minimum opacity percentage (UntF #Prc) */
  minimumOpacity: 'minimumOpacity',

  /** Flow jitter percentage (UntF #Prc) */
  flowJitter: 'flowJitter',

  /** Flow jitter control (enum) */
  flowJitterControl: 'flowJitterControl',

  /** Minimum flow percentage (UntF #Prc) */
  minimumFlow: 'minimumFlow',

  /** Wetness jitter percentage (UntF #Prc) - Mixer Brush only */
  wetnessJitter: 'wetnessJitter',

  /** Wetness jitter control (enum) - Mixer Brush only */
  wetnessJitterControl: 'wetnessJitterControl',

  /** Minimum wetness percentage (UntF #Prc) - Mixer Brush only */
  minimumWetness: 'minimumWetness',

  /** Mix jitter percentage (UntF #Prc) - Mixer Brush only */
  mixJitter: 'mixJitter',

  /** Mix jitter control (enum) - Mixer Brush only */
  mixJitterControl: 'mixJitterControl',

  /** Minimum mix percentage (UntF #Prc) - Mixer Brush only */
  minimumMix: 'minimumMix'
} as const;

// ============================================================================
// MARK: Brush Pose Keys
// ============================================================================

export const BrushPoseKeys = {
  /** Brush pose enabled (bool) */
  useBrushPose: 'brushPoseEnabled',

  /** Override tilt X (bool) */
  overrideTiltX: 'overrideTiltX',

  /** Tilt X value (-100 to 100) */
  tiltX: 'tiltX',

  /** Override tilt Y (bool) */
  overrideTiltY: 'overrideTiltY',

  /** Tilt Y value (-100 to 100) */
  tiltY: 'tiltY',

  /** Override rotation (bool) */
  overrideRotation: 'overrideRotation',

  /** Rotation value in degrees (0 to 360) - NOT same as brush angle (-179 to 180) */
  rotation: 'rotation',

  /** Override pressure (bool) */
  overridePressure: 'overridePressure',

  /** Pressure value (0 to 100) */
  pressure: 'pressure'
} as const;

// ============================================================================
// MARK: Quick Toggle Keys (Simple On/Off Settings)
// ============================================================================

export const QuickToggleKeys = {
  /** Noise enabled (bool) */
  useNoise: 'noiseEnabled',

  /** Wet edges enabled (bool) */
  wetEdges: 'wetEdgesEnabled',

  /** Build-up / Airbrush mode enabled (bool) */
  Arbrsh: 'buildUpEnabled',

  /** Smoothing enabled (bool) */
  useSmoothing: 'smoothingEnabled',

  /** Protect texture enabled (bool) */
  protectTexture: 'protectTextureEnabled'
} as const;

// ============================================================================
// MARK: Control Type Value Mappings
// ============================================================================

/**
 * Maps Photoshop enum values to human-readable control types
 */
export const ControlTypeValues = {
  /** No dynamic control */
  strokeDynamicsOff: 'off',

  /** Fade over steps */
  strokeDynamicsFade: 'fade',

  /** Dial input (Microsoft Surface Dial, etc.) */
  strokeDynamicsDial: 'dial',

  /** Pen pressure */
  strokeDynamicsPenPressure: 'penPressure',

  /** Pen tilt */
  strokeDynamicsPenTilt: 'penTilt',

  /** Stylus wheel (airbrush) */
  strokeDynamicsStylusWheel: 'stylusWheel',

  /** Stylus barrel rotation */
  strokeDynamicsRotation: 'rotation',

  /** Initial stroke direction */
  strokeDynamicsInitialDirection: 'initialDirection',

  /** Continuous stroke direction */
  strokeDynamicsDirection: 'direction'
} as const;

// ============================================================================
// MARK: Blend Mode Value Mappings
// ============================================================================

/**
 * Maps Photoshop enum values to human-readable blend modes
 */
export const BlendModeValues = {
  Nrml: 'normal',
  Dslv: 'dissolve',
  Bhnd: 'behind',
  Cler: 'clear',
  Drkn: 'darken',
  Mltp: 'multiply',
  CBrn: 'colorBurn',
  linearBurn: 'linearBurn',
  darkerColor: 'darkerColor',
  Lghn: 'lighten',
  Scrn: 'screen',
  CDdg: 'colorDodge',
  linearDodge: 'linearDodge',
  lighterColor: 'lighterColor',
  Ovrl: 'overlay',
  SftL: 'softLight',
  HrdL: 'hardLight',
  vividLight: 'vividLight',
  linearLight: 'linearLight',
  pinLight: 'pinLight',
  hardMix: 'hardMix',
  Dfrn: 'difference',
  Xclu: 'exclusion',
  Sbtr: 'subtract',
  divide: 'divide',
  'H   ': 'hue',
  Strt: 'saturation',
  'Clr ': 'color',
  Lmns: 'luminosity'
} as const;

// ============================================================================
// MARK: Unit Type Mappings
// ============================================================================

/**
 * Maps Photoshop unit type codes to human-readable names
 */
export const UnitTypes = {
  '#Pxl': 'pixels',
  '#Prc': 'percent',
  '#Ang': 'angle',
  '#Rsl': 'resolution',
  '#Rlt': 'relative',
  '#Pnt': 'points',
  '#Mlm': 'millimeters',
  '#Nne': 'none'
} as const;

// ============================================================================
// MARK: Type Exports
// ============================================================================

export type BrushDefinitionKey = keyof typeof BrushDefinitionKeys;
export type BrushPresetKey = keyof typeof BrushPresetKeys;
export type ShapeDynamicsKey = keyof typeof ShapeDynamicsKeys;
export type ScatteringKey = keyof typeof ScatteringKeys;
export type TextureKey = keyof typeof TextureKeys;
export type DualBrushKey = keyof typeof DualBrushKeys;
export type ColorDynamicsKey = keyof typeof ColorDynamicsKeys;
export type TransferKey = keyof typeof TransferKeys;
export type BrushPoseKey = keyof typeof BrushPoseKeys;
export type QuickToggleKey = keyof typeof QuickToggleKeys;
export type ControlTypeValue = keyof typeof ControlTypeValues;
export type BlendModeValue = keyof typeof BlendModeValues;
export type UnitType = keyof typeof UnitTypes;
