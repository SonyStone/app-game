import { lazy } from 'solid-js';
import type { VariantInfo } from '../../kit/variant';

/** Orbit: after Krita pop-up palette. */
export const orbit: VariantInfo = {
  id: 'orbit',
  name: 'Orbit',
  inspiredBy: 'Krita pop-up palette',
  idea:
    'Krita’s pop-up palette grown into the whole UI: one disc under the pen — color selector in the middle, recent ' +
    'colors around it, a ring of brush presets, and a rim that turns the canvas. Tools, view functions, curved ' +
    'setting gauges and a crescent of layers orbit it.',
  howTo: {
    pen:
      'Tap a preset, tool or swatch to pick it and go back to drawing. Drag on the hue ring or square for color, ' +
      'along the rim to turn the canvas (double tap: 0°), along an arc to set a value; press-drag Pan or Zoom.',
    touch:
      'Long-press to open. The same taps and drags as the pen; hold a preset to read its name. Fingers on the bare ' +
      'drawing still pan and pinch.',
    mouse:
      'Right click opens. Hover names presets and tools. Wheel: over the rim turns 5°, over the presets cycles ' +
      'them, over a gauge steps its value, over a choice, opacity or blend cycles it. Shift snaps the rim to 15°.',
    keys: ', . presets · ← → turn 15° · 1–8 tools · Tab more settings · Esc closes'
  },
  component: lazy(() => import('./OrbitVariant'), { export: 'OrbitVariant' })
};
