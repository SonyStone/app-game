/** Generated readable descriptor shapes. Optional fields preserve absence. */
import type { Percent, Degrees, Pixels } from './brands.js';
/** A preserved field whose name/type/meaning is unknown or whose key is ambiguous. Read-only during patching. */
export type Extension = {
    readonly key: {
        readonly kind: 'fourCC' | 'string';
        readonly value: string;
    };
    readonly value: unknown;
    readonly reason: string;
};
/** Shared readable object metadata. Original class spelling remains in source bytes. */
export interface ReadableObject {
    /** Readable class name, stable during editing. */
    readonly kind: string;
    /** Unknown, ambiguous or nonconforming fields, preserved alongside original source bytes. */
    readonly extensions?: readonly Extension[];
}
/** An enumeration whose raw identifiers are retained in source for exact edits. */
export interface Enumeration {
    domain: string;
    value: string;
}
/** Readable fields from `brushPreset`. Units are types, not name suffixes. */
export interface Preset extends ReadableObject {
    /** `Brgh`: UntF in #Prc. */
    brightness?: Percent;
    /** `Brsh`: Objc. */
    tip?: Tip;
    /** `Cnt `: doub/long. */
    count?: number;
    /** `H   `: UntF in #Prc. */
    hue?: Percent;
    /** `InvT`: bool. */
    invertTexture?: boolean;
    /** `Nm  `: TEXT. */
    name?: string;
    /** `Nose`: bool. */
    noiseEnabled?: boolean;
    /** `Rpt `: bool. */
    buildUpEnabled?: boolean;
    /** `Spcn`: UntF in #Prc. */
    spacing?: Percent;
    /** `Strt`: UntF in #Prc. */
    saturation?: Percent;
    /** `TxtC`: bool. */
    textureEachTip?: boolean;
    /** `Txtr`: Objc. */
    texture?: TxtrSettings;
    /** `Wtdg`: bool. */
    wetEdgesEnabled?: boolean;
    /** `angleDynamics`: Objc. */
    angleDynamics?: AngleDynamicsSettings;
    /** `bothAxes`: bool. */
    bothAxes?: boolean;
    /** `brushGroup`: Objc. */
    brushGroup?: BrushGroupSettings;
    /** `brushPoseAngle`: long. */
    brushPoseAngle?: number;
    /** `brushPosePressure`: UntF in #Prc. */
    brushPosePressure?: Percent;
    /** `brushPoseTiltX`: long. */
    brushPoseTiltX?: number;
    /** `brushPoseTiltY`: long. */
    brushPoseTiltY?: number;
    /** `brushProjection`: bool. */
    brushProjection?: boolean;
    /** `clVr`: Objc. */
    colorDynamics?: ClVrSettings;
    /** `colorDynamicsPerTip`: bool. */
    colorDynamicsPerTip?: boolean;
    /** `countDynamics`: Objc. */
    countDynamics?: CountDynamicsSettings;
    /** `dualBrush`: Objc. */
    dualBrush?: DualBrush;
    /** `flipX`: bool. */
    flipX?: boolean;
    /** `flipY`: bool. */
    flipY?: boolean;
    /** `interpretation`: bool. */
    interpretation?: boolean;
    /** `minimumDepth`: UntF in #Prc. */
    minimumDepth?: Percent;
    /** `minimumDiameter`: UntF in #Prc. */
    minimumDiameter?: Percent;
    /** `minimumRoundness`: UntF in #Prc. */
    minimumRoundness?: Percent;
    /** `mxVr`: Objc. */
    mixDynamics?: MxVrSettings;
    /** `opVr`: Objc. */
    opacityDynamics?: OpVrSettings;
    /** `overridePoseAngle`: bool. */
    overridePoseAngle?: boolean;
    /** `overridePosePressure`: bool. */
    overridePosePressure?: boolean;
    /** `overridePoseTiltX`: bool. */
    overridePoseTiltX?: boolean;
    /** `overridePoseTiltY`: bool. */
    overridePoseTiltY?: boolean;
    /** `prVr`: Objc. */
    flowDynamics?: PrVrSettings;
    /** `protectTexture`: bool. */
    protectTexture?: boolean;
    /** `purity`: UntF in #Prc. */
    purity?: Percent;
    /** `roundnessDynamics`: Objc. */
    roundnessDynamics?: RoundnessDynamicsSettings;
    /** `scatterDynamics`: Objc. */
    scatterDynamics?: ScatterDynamicsSettings;
    /** `szVr`: Objc. */
    sizeDynamics?: SzVrSettings;
    /** `textureBlendMode`: enum. */
    textureBlendMode?: Enumeration;
    /** `textureBrightness`: long. */
    textureBrightness?: number;
    /** `textureContrast`: long. */
    textureContrast?: number;
    /** `textureDepth`: UntF in #Prc. */
    textureDepth?: Percent;
    /** `textureDepthDynamics`: Objc. */
    textureDepthDynamics?: TextureDepthDynamicsSettings;
    /** `textureScale`: UntF in #Prc. */
    textureScale?: Percent;
    /** `tiltScale`: UntF in #Prc. */
    tiltScale?: Percent;
    /** `toolOptions`: Objc. */
    toolOptions?: ToolOptions;
    /** `useBrushPose`: bool. */
    useBrushPose?: boolean;
    /** `useBrushSize`: bool. */
    keepCurrentSize?: boolean;
    /** `useColorDynamics`: bool. */
    useColorDynamics?: boolean;
    /** `usePaintDynamics`: bool. */
    transferEnabled?: boolean;
    /** `useScatter`: bool. */
    scatteringEnabled?: boolean;
    /** `useTexture`: bool. */
    textureEnabled?: boolean;
    /** `useTipDynamics`: bool. */
    shapeDynamicsEnabled?: boolean;
    /** `wtVr`: Objc. */
    wetnessDynamics?: WtVrSettings;
}
/** Readable fields from `Brsh`. Units are types, not name suffixes. */
export interface Tip extends ReadableObject {
    /** `Brsh.Angl`: UntF in #Ang. */
    angle?: Degrees;
    /** `Brsh.Dmtr`: UntF in #Pxl. */
    diameter?: Pixels;
    /** `Brsh.Dnst`: UntF in #Prc. */
    density?: Percent;
    /** `Brsh.Hrdn`: UntF in #Prc. */
    hardness?: Percent;
    /** `Brsh.Intr`: bool. */
    spacingEnabled?: boolean;
    /** `Brsh.Lngt`: UntF in #Prc. */
    length?: Percent;
    /** `Brsh.Nm  `: TEXT. */
    name?: string;
    /** `Brsh.Rndn`: UntF in #Prc. */
    roundness?: Percent;
    /** `Brsh.Shp `: long. */
    shape?: number;
    /** `Brsh.Spcn`: UntF in #Prc. */
    spacing?: Percent;
    /** `Brsh.clumping`: UntF in #Prc. */
    clumping?: Percent;
    /** `Brsh.dtipsAirbrushCutoffAngle`: doub. */
    dtipsAirbrushCutoffAngle?: number;
    /** `Brsh.dtipsAirbrushGranularity`: UntF in #Prc. */
    dtipsAirbrushGranularity?: Percent;
    /** `Brsh.dtipsAirbrushSplatCount`: long. */
    dtipsAirbrushSplatCount?: number;
    /** `Brsh.dtipsAirbrushSplatSize`: UntF in #Prc. */
    dtipsAirbrushSplatSize?: Percent;
    /** `Brsh.dtipsAirbrushStreakiness`: UntF in #Prc. */
    dtipsAirbrushStreakiness?: Percent;
    /** `Brsh.dtipsErodibleTipCustomized`: bool. */
    dtipsErodibleTipCustomized?: boolean;
    /** `Brsh.dtipsErodibleTipHeightMap`: tdta. */
    dtipsErodibleTipHeightMap?: Uint8Array;
    /** `Brsh.dtipsGridSize`: long. */
    dtipsGridSize?: number;
    /** `Brsh.dtipsHardness`: UntF in #Prc. */
    dtipsHardness?: Percent;
    /** `Brsh.dtipsLengthRatio`: UntF in #Prc. */
    dtipsLengthRatio?: Percent;
    /** `Brsh.dtipsType`: long. */
    dtipsType?: number;
    /** `Brsh.flipX`: bool. */
    flipX?: boolean;
    /** `Brsh.flipY`: bool. */
    flipY?: boolean;
    /** `Brsh.physics`: bool. */
    physics?: boolean;
    /** `Brsh.sampledData`: TEXT. */
    sampleId?: string;
    /** `Brsh.stiffness`: UntF in #Prc. */
    stiffness?: Percent;
    /** `Brsh.thickness`: UntF in #Prc. */
    thickness?: Percent;
}
/** Readable fields from `Txtr`. Units are types, not name suffixes. */
export interface TxtrSettings extends ReadableObject {
    /** `Txtr.Idnt`: TEXT. */
    identifier?: string;
    /** `Txtr.Nm  `: TEXT. */
    name?: string;
}
/** Readable fields from `angleDynamics`. Units are types, not name suffixes. */
export interface AngleDynamicsSettings extends ReadableObject {
    /** `angleDynamics.Mnm `: UntF in #Prc. */
    minimum?: Percent;
    /** `angleDynamics.bVTy`: long. */
    control?: number;
    /** `angleDynamics.fStp`: long. */
    fadeSteps?: number;
    /** `angleDynamics.jitter`: UntF in #Prc. */
    jitter?: Percent;
}
/** Readable fields from `brushGroup`. Units are types, not name suffixes. */
export interface BrushGroupSettings extends ReadableObject {
    /** `brushGroup.useBrushGroup`: bool. */
    useBrushGroup?: boolean;
}
/** Readable fields from `clVr`. Units are types, not name suffixes. */
export interface ClVrSettings extends ReadableObject {
    /** `clVr.Mnm `: UntF in #Prc. */
    minimum?: Percent;
    /** `clVr.bVTy`: long. */
    control?: number;
    /** `clVr.fStp`: long. */
    fadeSteps?: number;
    /** `clVr.jitter`: UntF in #Prc. */
    jitter?: Percent;
}
/** Readable fields from `countDynamics`. Units are types, not name suffixes. */
export interface CountDynamicsSettings extends ReadableObject {
    /** `countDynamics.Mnm `: UntF in #Prc. */
    minimum?: Percent;
    /** `countDynamics.bVTy`: long. */
    control?: number;
    /** `countDynamics.fStp`: long. */
    fadeSteps?: number;
    /** `countDynamics.jitter`: UntF in #Prc. */
    jitter?: Percent;
}
/** Readable fields from `dualBrush`. Units are types, not name suffixes. */
export interface DualBrush extends ReadableObject {
    /** `dualBrush.BlnM`: enum. */
    blendMode?: Enumeration;
    /** `dualBrush.Brsh`: Objc. */
    tip?: DualBrushBrshSettings;
    /** `dualBrush.Cnt `: doub/long. */
    count?: number;
    /** `dualBrush.Flip`: bool. */
    flip?: boolean;
    /** `dualBrush.Spcn`: UntF in #Prc. */
    spacing?: Percent;
    /** `dualBrush.bothAxes`: bool. */
    bothAxes?: boolean;
    /** `dualBrush.countDynamics`: Objc. */
    countDynamics?: DualBrushCountDynamicsSettings;
    /** `dualBrush.scatterDynamics`: Objc. */
    scatterDynamics?: DualBrushScatterDynamicsSettings;
    /** `dualBrush.useDualBrush`: bool. */
    enabled?: boolean;
    /** `dualBrush.useScatter`: bool. */
    scatteringEnabled?: boolean;
}
/** Readable fields from `dualBrush.Brsh`. Units are types, not name suffixes. */
export interface DualBrushBrshSettings extends ReadableObject {
    /** `dualBrush.Brsh.Angl`: UntF in #Ang. */
    angle?: Degrees;
    /** `dualBrush.Brsh.Dmtr`: UntF in #Pxl. */
    diameter?: Pixels;
    /** `dualBrush.Brsh.Hrdn`: UntF in #Prc. */
    hardness?: Percent;
    /** `dualBrush.Brsh.Intr`: bool. */
    spacingEnabled?: boolean;
    /** `dualBrush.Brsh.Nm  `: TEXT. */
    name?: string;
    /** `dualBrush.Brsh.Rndn`: UntF in #Prc. */
    roundness?: Percent;
    /** `dualBrush.Brsh.Spcn`: UntF in #Prc. */
    spacing?: Percent;
    /** `dualBrush.Brsh.flipX`: bool. */
    flipX?: boolean;
    /** `dualBrush.Brsh.flipY`: bool. */
    flipY?: boolean;
    /** `dualBrush.Brsh.sampledData`: TEXT. */
    sampleId?: string;
    /** `dualBrush.Brsh.Idnt`: TEXT. */
    identifier?: string;
}
/** Readable fields from `dualBrush.countDynamics`. Units are types, not name suffixes. */
export interface DualBrushCountDynamicsSettings extends ReadableObject {
    /** `dualBrush.countDynamics.Mnm `: UntF in #Prc. */
    minimum?: Percent;
    /** `dualBrush.countDynamics.bVTy`: long. */
    control?: number;
    /** `dualBrush.countDynamics.fStp`: long. */
    fadeSteps?: number;
    /** `dualBrush.countDynamics.jitter`: UntF in #Prc. */
    jitter?: Percent;
}
/** Readable fields from `dualBrush.scatterDynamics`. Units are types, not name suffixes. */
export interface DualBrushScatterDynamicsSettings extends ReadableObject {
    /** `dualBrush.scatterDynamics.Mnm `: UntF in #Prc. */
    minimum?: Percent;
    /** `dualBrush.scatterDynamics.bVTy`: long. */
    control?: number;
    /** `dualBrush.scatterDynamics.fStp`: long. */
    fadeSteps?: number;
    /** `dualBrush.scatterDynamics.jitter`: UntF in #Prc. */
    jitter?: Percent;
}
/** Readable fields from `mxVr`. Units are types, not name suffixes. */
export interface MxVrSettings extends ReadableObject {
    /** `mxVr.Mnm `: UntF in #Prc. */
    minimum?: Percent;
    /** `mxVr.bVTy`: long. */
    control?: number;
    /** `mxVr.fStp`: long. */
    fadeSteps?: number;
    /** `mxVr.jitter`: UntF in #Prc. */
    jitter?: Percent;
}
/** Readable fields from `opVr`. Units are types, not name suffixes. */
export interface OpVrSettings extends ReadableObject {
    /** `opVr.Mnm `: UntF in #Prc. */
    minimum?: Percent;
    /** `opVr.bVTy`: long. */
    control?: number;
    /** `opVr.fStp`: long. */
    fadeSteps?: number;
    /** `opVr.jitter`: UntF in #Prc. */
    jitter?: Percent;
}
/** Readable fields from `prVr`. Units are types, not name suffixes. */
export interface PrVrSettings extends ReadableObject {
    /** `prVr.Mnm `: UntF in #Prc. */
    minimum?: Percent;
    /** `prVr.bVTy`: long. */
    control?: number;
    /** `prVr.fStp`: long. */
    fadeSteps?: number;
    /** `prVr.jitter`: UntF in #Prc. */
    jitter?: Percent;
}
/** Readable fields from `roundnessDynamics`. Units are types, not name suffixes. */
export interface RoundnessDynamicsSettings extends ReadableObject {
    /** `roundnessDynamics.Mnm `: UntF in #Prc. */
    minimum?: Percent;
    /** `roundnessDynamics.bVTy`: long. */
    control?: number;
    /** `roundnessDynamics.fStp`: long. */
    fadeSteps?: number;
    /** `roundnessDynamics.jitter`: UntF in #Prc. */
    jitter?: Percent;
}
/** Readable fields from `scatterDynamics`. Units are types, not name suffixes. */
export interface ScatterDynamicsSettings extends ReadableObject {
    /** `scatterDynamics.Mnm `: UntF in #Prc. */
    minimum?: Percent;
    /** `scatterDynamics.bVTy`: long. */
    control?: number;
    /** `scatterDynamics.fStp`: long. */
    fadeSteps?: number;
    /** `scatterDynamics.jitter`: UntF in #Prc. */
    jitter?: Percent;
}
/** Readable fields from `szVr`. Units are types, not name suffixes. */
export interface SzVrSettings extends ReadableObject {
    /** `szVr.Mnm `: UntF in #Prc. */
    minimum?: Percent;
    /** `szVr.bVTy`: long. */
    control?: number;
    /** `szVr.fStp`: long. */
    fadeSteps?: number;
    /** `szVr.jitter`: UntF in #Prc. */
    jitter?: Percent;
}
/** Readable fields from `textureDepthDynamics`. Units are types, not name suffixes. */
export interface TextureDepthDynamicsSettings extends ReadableObject {
    /** `textureDepthDynamics.Mnm `: UntF in #Prc. */
    minimum?: Percent;
    /** `textureDepthDynamics.bVTy`: long. */
    control?: number;
    /** `textureDepthDynamics.fStp`: long. */
    fadeSteps?: number;
    /** `textureDepthDynamics.jitter`: UntF in #Prc. */
    jitter?: Percent;
}
/** Readable fields from `toolOptions`. Units are types, not name suffixes. */
export interface ToolOptions extends ReadableObject {
    /** `toolOptions.BckC`: Objc. */
    backgroundColor?: ToolOptionsBckCSettings;
    /** `toolOptions.BlrS`: bool. */
    filterAllLayers?: boolean;
    /** `toolOptions.ErsB`: long. */
    eraserMode?: number;
    /** `toolOptions.FrgC`: Objc. */
    foregroundColor?: ToolOptionsFrgCSettings;
    /** `toolOptions.Lght`: UntF in #Prc. */
    lightness?: Percent;
    /** `toolOptions.Md  `: enum. */
    mode?: Enumeration;
    /** `toolOptions.MgcE`: bool. */
    eraseToHistory?: boolean;
    /** `toolOptions.Opct`: long. */
    opacity?: number;
    /** `toolOptions.PncA`: bool. */
    autoErase?: boolean;
    /** `toolOptions.Prs `: long. */
    strength?: number;
    /** `toolOptions.Ptrn`: Objc. */
    pattern?: ToolOptionsPtrnSettings;
    /** `toolOptions.SmdF`: bool. */
    fingerPainting?: boolean;
    /** `toolOptions.SmdS`: bool. */
    smudgeAllLayers?: boolean;
    /** `toolOptions.autoClean`: bool. */
    autoClean?: boolean;
    /** `toolOptions.autoFill`: bool. */
    autoFill?: boolean;
    /** `toolOptions.brushPreset`: bool. */
    brushPreset?: boolean;
    /** `toolOptions.chroma`: UntF in #Prc. */
    chroma?: Percent;
    /** `toolOptions.clVr`: Objc. */
    colorDynamics?: ToolOptionsClVrSettings;
    /** `toolOptions.detailBoost`: bool. */
    detailBoost?: boolean;
    /** `toolOptions.dryness`: doub/long. */
    dryness?: number;
    /** `toolOptions.flow`: long. */
    flow?: number;
    /** `toolOptions.loadSolidColorOnly`: bool. */
    loadSolidColorOnly?: boolean;
    /** `toolOptions.mix`: doub/long. */
    mix?: number;
    /** `toolOptions.mxVr`: Objc. */
    mixDynamics?: ToolOptionsMxVrSettings;
    /** `toolOptions.opVr`: Objc. */
    opacityDynamics?: ToolOptionsOpVrSettings;
    /** `toolOptions.prVr`: Objc. */
    flowDynamics?: ToolOptionsPrVrSettings;
    /** `toolOptions.pressureSmoothing`: bool. */
    pressureSmoothing?: boolean;
    /** `toolOptions.reservoirState`: long. */
    reservoirState?: number;
    /** `toolOptions.sampleAllLayers`: bool. */
    sampleAllLayers?: boolean;
    /** `toolOptions.scatter`: UntF in #Prc. */
    scatter?: Percent;
    /** `toolOptions.smoothing`: bool. */
    smoothing?: boolean;
    /** `toolOptions.smoothingCatchup`: bool. */
    smoothingCatchup?: boolean;
    /** `toolOptions.smoothingCatchupAtEnd`: bool. */
    smoothingCatchupAtEnd?: boolean;
    /** `toolOptions.smoothingRadiusMode`: bool. */
    smoothingRadiusMode?: boolean;
    /** `toolOptions.smoothingValue`: doub/long. */
    smoothingValue?: number;
    /** `toolOptions.smoothingZoomCompensation`: bool. */
    smoothingZoomCompensation?: boolean;
    /** `toolOptions.szVr`: Objc. */
    sizeDynamics?: ToolOptionsSzVrSettings;
    /** `toolOptions.useLegacy`: bool. */
    useLegacy?: boolean;
    /** `toolOptions.usePressureOverridesOpacity`: bool. */
    usePressureOverridesOpacity?: boolean;
    /** `toolOptions.usePressureOverridesSize`: bool. */
    usePressureOverridesSize?: boolean;
    /** `toolOptions.wetness`: doub/long. */
    wetness?: number;
    /** `toolOptions.wtVr`: Objc. */
    wetnessDynamics?: ToolOptionsWtVrSettings;
    /** `toolOptions.Rpt `: bool. */
    buildUpEnabled?: boolean;
}
/** Readable fields from `toolOptions.BckC`. Units are types, not name suffixes. */
export interface ToolOptionsBckCSettings extends ReadableObject {
    /** `toolOptions.BckC.Bl  `: doub/long. */
    blue?: number;
    /** `toolOptions.BckC.Grn `: doub/long. */
    green?: number;
    /** `toolOptions.BckC.Rd  `: doub/long. */
    red?: number;
    /** `toolOptions.BckC.Gry `: doub. */
    gray?: number;
    /** `toolOptions.BckC.Lmnc`: doub. */
    lightness?: number;
    /** `toolOptions.BckC.A   `: doub. */
    a?: number;
    /** `toolOptions.BckC.B   `: doub. */
    b?: number;
    /** `toolOptions.BckC.Blck`: doub. */
    black?: number;
    /** `toolOptions.BckC.Brgh`: doub. */
    brightness?: number;
    /** `toolOptions.BckC.Cyn `: doub. */
    cyan?: number;
    /** `toolOptions.BckC.H   `: UntF in #Ang. */
    hue?: Degrees;
    /** `toolOptions.BckC.Mgnt`: doub. */
    magenta?: number;
    /** `toolOptions.BckC.Strt`: doub. */
    saturation?: number;
    /** `toolOptions.BckC.Ylw `: doub. */
    yellow?: number;
}
/** Readable fields from `toolOptions.FrgC`. Units are types, not name suffixes. */
export interface ToolOptionsFrgCSettings extends ReadableObject {
    /** `toolOptions.FrgC.Bl  `: doub. */
    blue?: number;
    /** `toolOptions.FrgC.Blck`: doub. */
    black?: number;
    /** `toolOptions.FrgC.Brgh`: doub. */
    brightness?: number;
    /** `toolOptions.FrgC.Cyn `: doub. */
    cyan?: number;
    /** `toolOptions.FrgC.Grn `: doub. */
    green?: number;
    /** `toolOptions.FrgC.H   `: UntF in #Ang. */
    hue?: Degrees;
    /** `toolOptions.FrgC.Mgnt`: doub. */
    magenta?: number;
    /** `toolOptions.FrgC.Rd  `: doub. */
    red?: number;
    /** `toolOptions.FrgC.Strt`: doub. */
    saturation?: number;
    /** `toolOptions.FrgC.Ylw `: doub. */
    yellow?: number;
    /** `toolOptions.FrgC.Gry `: doub. */
    gray?: number;
    /** `toolOptions.FrgC.Lmnc`: doub. */
    lightness?: number;
    /** `toolOptions.FrgC.A   `: doub. */
    a?: number;
    /** `toolOptions.FrgC.B   `: doub. */
    b?: number;
}
/** Readable fields from `toolOptions.MdSl`. Units are types, not name suffixes. */
export interface ToolOptionsMdSlSettings extends ReadableObject {
    /** `toolOptions.MdSl.Opct`: long. */
    opacity?: number;
}
/** Readable fields from `toolOptions.Ptrn`. Units are types, not name suffixes. */
export interface ToolOptionsPtrnSettings extends ReadableObject {
    /** `toolOptions.Ptrn.Idnt`: TEXT. */
    identifier?: string;
    /** `toolOptions.Ptrn.Nm  `: TEXT. */
    name?: string;
}
/** Readable fields from `toolOptions.clVr`. Units are types, not name suffixes. */
export interface ToolOptionsClVrSettings extends ReadableObject {
    /** `toolOptions.clVr.Mnm `: UntF in #Prc. */
    minimum?: Percent;
    /** `toolOptions.clVr.bVTy`: long. */
    control?: number;
    /** `toolOptions.clVr.fStp`: long. */
    fadeSteps?: number;
    /** `toolOptions.clVr.jitter`: UntF in #Prc. */
    jitter?: Percent;
}
/** Readable fields from `toolOptions.mxVr`. Units are types, not name suffixes. */
export interface ToolOptionsMxVrSettings extends ReadableObject {
    /** `toolOptions.mxVr.Mnm `: UntF in #Prc. */
    minimum?: Percent;
    /** `toolOptions.mxVr.bVTy`: long. */
    control?: number;
    /** `toolOptions.mxVr.fStp`: long. */
    fadeSteps?: number;
    /** `toolOptions.mxVr.jitter`: UntF in #Prc. */
    jitter?: Percent;
}
/** Readable fields from `toolOptions.opVr`. Units are types, not name suffixes. */
export interface ToolOptionsOpVrSettings extends ReadableObject {
    /** `toolOptions.opVr.Mnm `: UntF in #Prc. */
    minimum?: Percent;
    /** `toolOptions.opVr.bVTy`: long. */
    control?: number;
    /** `toolOptions.opVr.fStp`: long. */
    fadeSteps?: number;
    /** `toolOptions.opVr.jitter`: UntF in #Prc. */
    jitter?: Percent;
}
/** Readable fields from `toolOptions.prVr`. Units are types, not name suffixes. */
export interface ToolOptionsPrVrSettings extends ReadableObject {
    /** `toolOptions.prVr.Mnm `: UntF in #Prc. */
    minimum?: Percent;
    /** `toolOptions.prVr.bVTy`: long. */
    control?: number;
    /** `toolOptions.prVr.fStp`: long. */
    fadeSteps?: number;
    /** `toolOptions.prVr.jitter`: UntF in #Prc. */
    jitter?: Percent;
}
/** Readable fields from `toolOptions.szVr`. Units are types, not name suffixes. */
export interface ToolOptionsSzVrSettings extends ReadableObject {
    /** `toolOptions.szVr.Mnm `: UntF in #Prc. */
    minimum?: Percent;
    /** `toolOptions.szVr.bVTy`: long. */
    control?: number;
    /** `toolOptions.szVr.fStp`: long. */
    fadeSteps?: number;
    /** `toolOptions.szVr.jitter`: UntF in #Prc. */
    jitter?: Percent;
}
/** Readable fields from `toolOptions.wtVr`. Units are types, not name suffixes. */
export interface ToolOptionsWtVrSettings extends ReadableObject {
    /** `toolOptions.wtVr.Mnm `: UntF in #Prc. */
    minimum?: Percent;
    /** `toolOptions.wtVr.bVTy`: long. */
    control?: number;
    /** `toolOptions.wtVr.fStp`: long. */
    fadeSteps?: number;
    /** `toolOptions.wtVr.jitter`: UntF in #Prc. */
    jitter?: Percent;
}
/** Readable fields from `wtVr`. Units are types, not name suffixes. */
export interface WtVrSettings extends ReadableObject {
    /** `wtVr.Mnm `: UntF in #Prc. */
    minimum?: Percent;
    /** `wtVr.bVTy`: long. */
    control?: number;
    /** `wtVr.fStp`: long. */
    fadeSteps?: number;
    /** `wtVr.jitter`: UntF in #Prc. */
    jitter?: Percent;
}
/** Computed-tip view narrowed by its readable class discriminant. */
export type ComputedTip = Tip & {
    readonly kind: 'computed';
};
/** One preset, with a stable positional identity used to detect accidental reordering. */
export interface Brush extends Preset {
    readonly sourceId: string;
}
