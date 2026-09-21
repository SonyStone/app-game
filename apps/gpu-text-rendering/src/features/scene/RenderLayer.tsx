import { createToken } from '@solid-primitives/jsx-tokenizer';
import type { SceneDraw } from './renderScene';

/**
 * Describes a draw layer for FrameLoop's token resolver; performs no registration or DOM rendering.
 * Higher order draws on top, default 0. Equal orders follow JSX order, including late async children.
 * Prop changes invalidate the scene; changes read inside draw need explicit invalidation.
 */
export const RenderLayer = createToken<{
  draw: SceneDraw;
  order?: number;
  /** Skips drawing without disposing the component or its GPU resources. Default true. */
  visible?: boolean;
}>();
