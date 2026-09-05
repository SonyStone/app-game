import type { IMeshCapture } from './meshCapture';
import type { ITextureCapture } from './textureCapture';

/** One deduplicated draw represented in the combined scene preview. */
export interface ISceneMeshCapture {
  readonly mesh: Extract<IMeshCapture, { readonly status: 'available' }>;
  readonly texture?: Extract<ITextureCapture, { readonly status: 'available' }>;
  readonly textureUniformName?: string;
}

/** Bounded collection of unique meshes reconstructed from a captured frame. */
export type ISceneCapture =
  | {
      readonly status: 'available';
      readonly meshes: readonly ISceneMeshCapture[];
      /** Source world axis treated as vertical when presenting the reconstructed scene. */
      readonly upAxis: 'y' | 'z';
      readonly drawCount: number;
      readonly duplicateDrawCount: number;
      readonly skippedDrawCount: number;
      /** Draws that could not be reconstructed into shared view-space geometry. */
      readonly unreadableDrawCount: number;
      /** Distinct reasons that prevented draw reconstruction. */
      readonly unreadableReasons: readonly string[];
      /** Reconstructed draws made with another camera, such as shadow and reflection passes. */
      readonly alternateCameraDrawCount: number;
      /** Draws omitted only because the scene safety limit was reached. */
      readonly limitedDrawCount: number;
      /** Meshes with a captured UV-like vertex attribute. */
      readonly uvMeshCount: number;
      /** Meshes whose draw state identifies a likely color texture. */
      readonly colorTextureCandidateCount: number;
      /** Color texture candidates that could not be sampled from the live context. */
      readonly textureFailureCount: number;
      readonly texturedMeshCount: number;
      readonly truncated: boolean;
    }
  | { readonly status: 'unavailable'; readonly reason: string };
