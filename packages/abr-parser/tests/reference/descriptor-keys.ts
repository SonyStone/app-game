/**
 * Documented ABR wire keys, grouped by their containing descriptor object.
 * Keys are exact (including trailing spaces); values are readable labels.
 * This is a partial vocabulary, not a parser allowlist. Unknown setting keys
 * are retained in Brush.descriptor and Brush.settings by the generic reader.
 * Dynamics are nested brVr objects; controls are integers, not enum strings.
 */

/** Keys inside Brsh. Its descriptor class identifies the tip family. */
export const BrushDefinitionKeys = {
  Dmtr: 'diameter',
  Hrdn: 'hardness',
  Angl: 'angle',
  Rndn: 'roundness',
  Spcn: 'spacing',
  /** Whether distance-based spacing is enabled; not a smoothing switch. */
  Intr: 'spacingEnabled',
  flipX: 'flipX',
  flipY: 'flipY',
  sampledData: 'sampledDataUuid',
  'Nm  ': 'name'
} as const;
export type BrushDefinitionKey = keyof typeof BrushDefinitionKeys;

/** Keys at the preset root; child objects have their own dictionaries below. */
export const BrushPresetKeys = {
  'Nm  ': 'name',
  Brsh: 'brushDefinition',
  Idnt: 'identifier',
  useBrushSize: 'useBrushSize',
  brushGroup: 'brushGroup',
  dualBrush: 'dualBrush',
  toolOptions: 'toolOptions'
} as const;
export type BrushPresetKey = keyof typeof BrushPresetKeys;

/** Root shape settings. Brsh.flipX/Y flip the tip; these flipX/Y randomize it. */
export const ShapeDynamicsKeys = {
  useTipDynamics: 'shapeDynamicsEnabled',
  szVr: 'sizeDynamics',
  minimumDiameter: 'minimumDiameter',
  tiltScale: 'tiltScale',
  angleDynamics: 'angleDynamics',
  roundnessDynamics: 'roundnessDynamics',
  minimumRoundness: 'minimumRoundness',
  flipX: 'flipXJitter',
  flipY: 'flipYJitter',
  brushProjection: 'brushProjection'
} as const;
export type ShapeDynamicsKey = keyof typeof ShapeDynamicsKeys;

/** Keys inside each brVr dynamics object (szVr, opVr, scatterDynamics, etc.). */
export const DynamicsKeys = {
  /** Integer selector; see ControlTypeValues. */
  bVTy: 'control',
  fStp: 'fadeSteps',
  jitter: 'jitter',
  /** Control minimum; distinct from root minimumDiameter/minimumRoundness. */
  'Mnm ': 'minimum'
} as const;
export type DynamicsKey = keyof typeof DynamicsKeys;

/** Scattering keys at the preset root, also used inside dualBrush. */
export const ScatteringKeys = {
  useScatter: 'scatteringEnabled',
  scatterDynamics: 'scatterDynamics',
  bothAxes: 'bothAxes',
  'Cnt ': 'count',
  countDynamics: 'countDynamics'
} as const;
export type ScatteringKey = keyof typeof ScatteringKeys;

/** Root texture settings. Txtr contains the pattern name and identifier. */
export const TextureKeys = {
  useTexture: 'textureEnabled',
  Txtr: 'pattern',
  textureScale: 'scale',
  textureBrightness: 'brightness',
  textureContrast: 'contrast',
  textureDepth: 'depth',
  /** Photoshop's string-ID alias is textClickPoint, despite its brush meaning. */
  TxtC: 'textureEachTip',
  textureBlendMode: 'blendMode',
  minimumDepth: 'minimumDepth',
  textureDepthDynamics: 'depthDynamics',
  InvT: 'invert'
} as const;
export type TextureKey = keyof typeof TextureKeys;

/** Keys inside the root dualBrush object; tip geometry is inside its Brsh. */
export const DualBrushKeys = {
  useDualBrush: 'dualBrushEnabled',
  Brsh: 'brushDefinition',
  BlnM: 'blendMode',
  Flip: 'flip',
  useScatter: 'scatteringEnabled',
  scatterDynamics: 'scatterDynamics',
  bothAxes: 'bothAxes',
  'Cnt ': 'count',
  countDynamics: 'countDynamics'
} as const;
export type DualBrushKey = keyof typeof DualBrushKeys;

/** Root color dynamics; hue, saturation, brightness and purity carry percent units. */
export const ColorDynamicsKeys = {
  useColorDynamics: 'colorDynamicsEnabled',
  colorDynamicsPerTip: 'applyPerTip',
  clVr: 'foregroundBackgroundDynamics',
  'H   ': 'hueJitter',
  Strt: 'saturationJitter',
  Brgh: 'brightnessJitter',
  purity: 'purity'
} as const;
export type ColorDynamicsKey = keyof typeof ColorDynamicsKeys;

/** Root transfer settings, each dynamics value is a nested brVr object. */
export const TransferKeys = {
  usePaintDynamics: 'transferEnabled',
  opVr: 'opacityDynamics',
  prVr: 'flowDynamics',
  wtVr: 'wetnessDynamics',
  mxVr: 'mixDynamics'
} as const;
export type TransferKey = keyof typeof TransferKeys;

/** Root brush pose settings; rotation uses brushPoseAngle rather than Brsh.Angl. */
export const BrushPoseKeys = {
  useBrushPose: 'brushPoseEnabled',
  overridePoseTiltX: 'overrideTiltX',
  brushPoseTiltX: 'tiltX',
  overridePoseTiltY: 'overrideTiltY',
  brushPoseTiltY: 'tiltY',
  overridePoseAngle: 'overrideRotation',
  brushPoseAngle: 'rotation',
  overridePosePressure: 'overridePressure',
  brushPosePressure: 'pressure'
} as const;
export type BrushPoseKey = keyof typeof BrushPoseKeys;

/** Root toggles. Modern smoothing is stored separately in toolOptions.smoothing. */
export const QuickToggleKeys = {
  Nose: 'noiseEnabled',
  Wtdg: 'wetEdgesEnabled',
  'Rpt ': 'buildUpEnabled',
  protectTexture: 'protectTextureEnabled'
} as const;
export type QuickToggleKey = keyof typeof QuickToggleKeys;

/** Integer bVTy control selectors; individual settings support different subsets. */
export const ControlTypeValues = {
  0: 'off',
  1: 'fade',
  2: 'penPressure',
  3: 'penTilt',
  4: 'stylusWheel',
  5: 'initialDirection',
  6: 'direction',
  7: 'initialRotation',
  8: 'rotation'
} as const;
export type ControlTypeValue = keyof typeof ControlTypeValues;

/** Photoshop blend-mode enum values, including texture Height mode. */
export const BlendModeValues = {
  /** Texture Height mode. */
  Hght: 'height',
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
export type BlendModeValue = keyof typeof BlendModeValues;

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

export type UnitType = keyof typeof UnitTypes;
