/**
 * ABR (Photoshop Brush) File Parser - Type Definitions
 */

/**
 * Represents a parsed ABR brush file
 */
export interface AbrFile {
  fileName?: string;
  version: number;
  subVersion: number;
  brushes: Brush[];
  patterns?: Pattern[];
  /** Raw pattern block data for round-trip preservation */
  rawPatternData?: Uint8Array;
  /** Raw sample block data for round-trip preservation */
  rawSampleData?: Uint8Array;
  /** Raw descriptor block data for round-trip preservation */
  rawDescriptorData?: Uint8Array;
  errors: string[];
}

/**
 * Represents a single brush in the ABR file
 */
export interface Brush {
  id: string;
  name: string;
  type: 'computed' | 'sampled';
  spacing: number;
  diameter?: number;
  hardness?: number;
  angle?: number;
  roundness?: number;

  // Brush dynamics
  dynamics?: BrushDynamics;

  // For sampled brushes
  brushTip?: BrushTipImage;
  /** UUID reference to the sampled data in the samp block */
  sampledDataUuid?: string;

  // Data URL for browser display
  imageDataUrl?: string;

  // Dual brush tip (if dual brush is enabled)
  dualBrushTip?: BrushTipImage;
  dualBrushImageDataUrl?: string;

  // Raw settings from descriptor
  settings: Record<string, unknown>;
}

/**
 * Brush dynamics settings
 */
export interface BrushDynamics {
  sizeJitter?: DynamicControl;
  angleJitter?: DynamicControl;
  roundnessJitter?: DynamicControl;
  scatterJitter?: DynamicControl;
  countJitter?: DynamicControl;
  opacityJitter?: DynamicControl;
  flowJitter?: DynamicControl;
}

/**
 * Dynamic control for a brush property
 */
export interface DynamicControl {
  value: number;
  control: 'off' | 'fade' | 'penPressure' | 'penTilt' | 'stylusWheel' | 'rotation';
  fadeSteps?: number;
  minimumValue?: number;
}

/**
 * Brush tip bitmap image data
 */
export interface BrushTipImage {
  width: number;
  height: number;
  depth: number;
  /** Raw pixel data (grayscale) */
  data: Uint8Array;
  /** Compressed data if available (for round-trip preservation) */
  compressedData?: Uint8Array;
}

/**
 * Pattern used in brush
 */
export interface Pattern {
  id: string;
  name: string;
  width: number;
  height: number;
  data?: Uint8Array;
}

/**
 * Resource block in ABR file (8BIM format)
 */
export interface ResourceBlock {
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

/**
 * Options for parsing ABR files
 */
export interface ParseOptions {
  /** Extract brush tip images (default: true) */
  extractImages?: boolean;
  /** Include raw settings in output (default: true) */
  includeRawSettings?: boolean;
  /** Continue parsing on errors (default: true) */
  continueOnError?: boolean;
  /** Generate data URLs for images (browser only, default: true) */
  generateDataUrls?: boolean;
}

/**
 * Result of exporting brush images
 */
export interface ExportResult {
  success: boolean;
  brushId: string;
  brushName: string;
  filePath?: string;
  dataUrl?: string;
  error?: string;
}
