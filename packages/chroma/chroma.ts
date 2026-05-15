import type { ChromaStatic } from './color';
import { Color } from './color';

/**
 * Chroma.js is a tiny library for color conversions, interpolation, and scale generation.
 *
 * The callable `chroma(...)` factory mirrors the public static helpers defined on `Color`.
 */
export const chroma: ChromaStatic = Color.createFactory('@@version');
