import type { Brush } from './brush';
import { maskBrushColor, storedGoal, type LayerMask } from './layerMask';

/**
 * `brush` as it paints a mask towards effective coverage `goal`, 255 Reveal or 0 Hide (the runtime's `mask-paint`
 * setting), written into the stored coverage, reversed for an inverted mask; a background colour, as Pencil Auto
 * Erase paints, takes the other goal. It mixes in encoded values, so a stroke of coverage `c` moves the mask by
 * `c × (goal − old)`. An eraser keeps erasing: it lowers the plane's alpha, which the commit and the display read as
 * Hide (`coverageFromRgba`).
 */
export function maskStrokeBrush(brush: Brush, mask: Pick<LayerMask, 'inverted'>, goal: number): Brush {
  const grey = (value: number) => maskBrushColor(storedGoal(value, mask.inverted));
  return {
    ...brush,
    color: grey(goal),
    ...(brush.backgroundColor ? { backgroundColor: grey(255 - goal) } : {}),
    mixing: 'classic'
  };
}

/**
 * Why `brush` cannot paint a mask yet, or undefined when it can. Tools that sample the canvas or a history state mix
 * colours a single channel does not have: Smudge, the Mixer Brush, Blur and Sharpen, and Erase to History (the eraser
 * preset or the Alt modifier). Engines other than the round brush, its eraser and ABR presets are refused too, as
 * their output is unknown. `engine` is the engine the brush routes to without its own selection.
 */
export function maskStrokeRefusal(
  brush: Brush,
  modifiers: { altKey: boolean } | undefined,
  engine: string
): string | undefined {
  const id = brush.engine?.id ?? engine;
  if (id === 'abr') {
    const tool = (brush.engine?.settings as { values?: { tool?: { type?: string; eraseToHistory?: boolean } } })?.values
      ?.tool;
    const name = tool?.type && refusedAbrTools[tool.type];
    if (name) return `${name} cannot paint a mask yet. Use a brush or an eraser on the mask.`;
    if (tool?.type === 'ErTl' && (tool.eraseToHistory || modifiers?.altKey)) {
      return 'Erase to History cannot paint a mask yet. Use a brush or an eraser on the mask.';
    }

    return undefined;
  }

  return id === 'round' || id === 'eraser' ? undefined : 'This brush cannot paint a mask yet. Use a round brush.';
}

/** ABR tools that sample the canvas, by tool type, with their names. */
const refusedAbrTools: Record<string, string> = {
  SmTl: 'Smudge',
  MixB: 'The Mixer Brush',
  BlTl: 'Blur',
  ShTl: 'Sharpen'
};
