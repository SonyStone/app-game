import { z } from 'zod';

/**
 * MARK: ABR (Photoshop Brush) File Parser - Type Definitions
 */

// ============================================================================
// MARK: Branded Numeric Types
// ============================================================================

/**
 * Branded types for precise numeric representation matching binary format.
 * These provide compile-time type safety while remaining compatible with number.
 */

/** Unsigned 8-bit integer (0 to 255) */
export type U8 = number & { readonly __brand: 'u8' };

/** Unsigned 16-bit integer (0 to 65,535) */
export type U16 = number & { readonly __brand: 'u16' };

/** Unsigned 32-bit integer (0 to 4,294,967,295) */
export type U32 = number & { readonly __brand: 'u32' };

/** Signed 32-bit integer (-2,147,483,648 to 2,147,483,647) */
export type I32 = number & { readonly __brand: 'i32' };

/** 64-bit floating point (IEEE 754 double) */
export type F64 = number & { readonly __brand: 'f64' };

/** Percentage value (0 to 100) */
export type Percent = number & { readonly __brand: 'percent' };

/** Angle in degrees (0 to 360) */
export type Degrees = number & { readonly __brand: 'degrees' };

/** Pixel dimension (positive integer) */
export type Pixels = number & { readonly __brand: 'pixels' };

// ============================================================================
// MARK: Branded Type Constructors (with runtime validation)
// ============================================================================

export function u8(n: number): U8 {
  if (!Number.isInteger(n) || n < 0 || n > 255) {
    throw new RangeError(`u8 must be integer 0-255, got ${n}`);
  }
  return n as U8;
}

export function u16(n: number): U16 {
  if (!Number.isInteger(n) || n < 0 || n > 65535) {
    throw new RangeError(`u16 must be integer 0-65535, got ${n}`);
  }
  return n as U16;
}

export function u32(n: number): U32 {
  if (!Number.isInteger(n) || n < 0 || n > 4294967295) {
    throw new RangeError(`u32 must be integer 0-4294967295, got ${n}`);
  }
  return n as U32;
}

export function i32(n: number): I32 {
  if (!Number.isInteger(n) || n < -2147483648 || n > 2147483647) {
    throw new RangeError(`i32 must be integer -2147483648 to 2147483647, got ${n}`);
  }
  return n as I32;
}

export function f64(n: number): F64 {
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw new RangeError(`f64 must be a finite number, got ${n}`);
  }
  return n as F64;
}

export function percent(n: number): Percent {
  if (typeof n !== 'number' || n < 0 || n > 100) {
    throw new RangeError(`percent must be 0-100, got ${n}`);
  }
  return n as Percent;
}

export function degrees(n: number): Degrees {
  if (typeof n !== 'number' || n < -360 || n > 360) {
    throw new RangeError(`degrees must be -360 to 360, got ${n}`);
  }
  return n as Degrees;
}

export function pixels(n: number): Pixels {
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError(`pixels must be non-negative integer, got ${n}`);
  }
  return n as Pixels;
}

// ============================================================================
// MARK: Zod Schemas
// ============================================================================

/** Zod schema for unsigned 8-bit integer */
export const ZU8 = z.number().int().min(0).max(255);

/** Zod schema for unsigned 16-bit integer */
export const ZU16 = z.number().int().min(0).max(65535);

/** Zod schema for unsigned 32-bit integer */
export const ZU32 = z.number().int().min(0).max(4294967295);

/** Zod schema for signed 32-bit integer */
export const ZI32 = z.number().int().min(-2147483648).max(2147483647);

/** Zod schema for percentage (0-100) */
export const ZPercent = z.number().min(0).max(100);

/** Zod schema for angle in degrees */
export const ZDegrees = z.number().min(-360).max(360);

/** Zod schema for pixel dimensions */
export const ZPixels = z.number().int().min(0);

/** Dynamic control types for brush properties */
export const DynamicControlType = z.enum([
  'off', 'fade', 'penPressure', 'penTilt', 'stylusWheel', 'rotation'
]);
export type DynamicControlType = z.infer<typeof DynamicControlType>;

/** Zod schema for dynamic brush control */
export const ZDynamicControl = z.object({
  value: ZPercent,
  control: DynamicControlType,
  fadeSteps: z.number().int().min(1).optional(),
  minimumValue: ZPercent.optional(),
});

/** Zod schema for brush dynamics */
export const ZBrushDynamics = z.object({
  sizeJitter: ZDynamicControl.optional(),
  angleJitter: ZDynamicControl.optional(),
  roundnessJitter: ZDynamicControl.optional(),
  scatterJitter: ZDynamicControl.optional(),
  countJitter: ZDynamicControl.optional(),
  opacityJitter: ZDynamicControl.optional(),
  flowJitter: ZDynamicControl.optional(),
});

/** Zod schema for brush tip image */
export const ZBrushTipImage = z.object({
  width: ZPixels.min(1).max(8192),
  height: ZPixels.min(1).max(8192),
  depth: z.union([z.literal(8), z.literal(16)]), // 8-bit or 16-bit grayscale
  data: z.custom<Uint8Array>((val) => val instanceof Uint8Array),
  compressedData: z.custom<Uint8Array>((val) => val instanceof Uint8Array).optional(),
});

/** Brush type discriminator */
export const BrushType = z.enum(['computed', 'sampled']);
export type BrushType = z.infer<typeof BrushType>;

/** Zod schema for a brush */
export const ZBrush = z.object({
  id: z.string(),
  name: z.string().min(1),
  type: BrushType,
  spacing: ZPercent,
  diameter: ZPixels.optional(),
  hardness: ZPercent.optional(),
  angle: ZDegrees.optional(),
  roundness: ZPercent.optional(),
  dynamics: ZBrushDynamics.optional(),
  brushTip: ZBrushTipImage.optional(),
  sampledDataUuid: z.string().optional(),
  settings: z.record(z.string(), z.unknown()),
});

/** Zod schema for pattern */
export const ZPattern = z.object({
  id: z.string(),
  name: z.string(),
  width: ZPixels.min(1),
  height: ZPixels.min(1),
  data: z.instanceof(Uint8Array).optional(),
});

/** ABR file version */
export const ZAbrVersion = z.object({
  major: ZU16,
  minor: ZU16,
});

/** Zod schema for ABR file */
export const ZAbrFile = z.object({
  version: ZU16,
  subVersion: ZU16,
  brushes: z.array(ZBrush),
  patterns: z.array(ZPattern).optional(),
  rawPatternData: z.instanceof(Uint8Array).optional(),
  rawSampleData: z.instanceof(Uint8Array).optional(),
  rawDescriptorData: z.instanceof(Uint8Array).optional(),
  errors: z.array(z.string()),
});

/** Zod schema for parse options */
export const ZParseOptions = z.object({
  extractImages: z.boolean().optional().default(true),
  includeRawSettings: z.boolean().optional().default(true),
  continueOnError: z.boolean().optional().default(true),
});

/** Zod schema for export result */
export const ZExportResult = z.object({
  success: z.boolean(),
  brushId: z.string(),
  brushName: z.string(),
  filePath: z.string().optional(),
  error: z.string().optional(),
});

// ============================================================================
// MARK: Inferred Types from Zod Schemas (Primary Types)
// ============================================================================

/** Brush tip bitmap image data */
export type BrushTipImage = z.infer<typeof ZBrushTipImage>;

/** Dynamic control for a brush property */
export type DynamicControl = z.infer<typeof ZDynamicControl>;

/** Brush dynamics settings */
export type BrushDynamics = z.infer<typeof ZBrushDynamics>;

/** Represents a single brush in the ABR file */
export type Brush = z.infer<typeof ZBrush>;

/** Pattern used in brush */
export type Pattern = z.infer<typeof ZPattern>;

/** Represents a parsed ABR brush file */
export type AbrFile = z.infer<typeof ZAbrFile>;

/** Options for parsing ABR files (input accepts partial, output has defaults) */
export type ParseOptions = z.input<typeof ZParseOptions>;

/** Result of exporting brush images */
export type ExportResult = z.infer<typeof ZExportResult>;

// ============================================================================
// MARK: Types Not Covered by Zod (Binary Format Internals)
// ============================================================================

/**
 * Resource block in ABR file (8BIM format)
 */
export type ResourceBlock = {
  signature: string;
  key: string;
  length: number;
  data: Uint8Array;
}

/**
 * Photoshop Descriptor value types
 */
export type DescriptorValue = 
  | { type: 'long'; value: number }
  | { type: 'doub'; value: number }
  | { type: 'bool'; value: boolean }
  | { type: 'TEXT'; value: string }
  | { type: 'enum'; typeId: string; value: string }
  | { type: 'UntF'; unit: string; value: number }
  | { type: 'Objc'; classId: string; value: Record<string, DescriptorValue>; className?: string }
  | { type: 'VlLs'; value: DescriptorValue[] }
  | { type: 'tdta'; value: Uint8Array }
  | { type: 'obj '; value: unknown };
