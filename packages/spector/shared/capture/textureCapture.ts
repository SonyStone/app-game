/** Texture image sampled from a live captured WebGL binding. */
export type ITextureCapture =
  | {
      readonly status: 'available';
      readonly commandId: number;
      readonly uniformIndex: number;
      readonly textureIndex: number;
      readonly target: string;
      readonly width: number;
      readonly height: number;
      readonly src: string;
    }
  | {
      readonly status: 'unavailable';
      readonly commandId: number;
      readonly uniformIndex: number;
      readonly textureIndex: number;
      readonly reason: string;
    };
