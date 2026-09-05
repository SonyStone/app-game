/** One enabled vertex attribute that can be inspected as mesh position data. */
export interface IMeshAttributeCapture {
  readonly name: string;
  readonly dimensions: number;
  readonly type: string;
  readonly location: number;
}

/** Texture coordinates read from a non-instanced vertex attribute. */
export interface IMeshUvCapture {
  readonly attributeName: string;
  readonly dimensions: number;
  readonly values: readonly number[];
}

/** Geometry reconstructed from the buffer bindings of one captured draw call. */
export type IMeshCapture =
  | {
      readonly status: 'available';
      readonly commandId: number;
      readonly mode: number;
      readonly modeName: string;
      readonly positionAttribute: string;
      /** Whether positions came from shader replay or direct buffer decoding. */
      readonly positionSource: 'vertex-shader' | 'raw-buffer';
      /** Coordinate space used by the preview positions. */
      readonly positionSpace: 'world' | 'view' | 'clip' | 'buffer';
      /** Explains why shader replay fell back to raw buffer data. */
      readonly replayReason?: string;
      /** Matrix inverted after transform feedback to recover a rotatable space. */
      readonly inverseMatrixName?: string;
      /** Captured projection matrix used to reproduce the original camera view. */
      readonly projectionMatrix?: readonly number[];
      /** Exact per-vertex `gl_Position` values from the captured draw. */
      readonly clipPositions?: readonly number[];
      readonly availableAttributes: readonly IMeshAttributeCapture[];
      readonly uvs?: IMeshUvCapture;
      readonly dimensions: number;
      readonly positions: readonly number[];
      readonly indices: readonly number[] | null;
      readonly elementCount: number;
      readonly capturedElementCount: number;
      readonly instanceCount: number;
      readonly truncated: boolean;
    }
  | {
      readonly status: 'unavailable';
      readonly commandId: number;
      readonly reason: string;
    };
