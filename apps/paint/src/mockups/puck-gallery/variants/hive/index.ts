import { lazy } from 'solid-js';
import type { VariantInfo } from '../../kit/variant';

/** Hive: after Apple Watch honeycomb · hex palettes · strategy-game maps. */
export const hive: VariantInfo = {
  id: 'hive',
  name: 'Hive',
  inspiredBy: 'Apple Watch honeycomb · hex palettes · strategy-game maps',
  idea: 'One honeycomb grows out of the pen: the Puck under it (pan, zoom, rotate, undo, redo, size), tools on the hand side, a hex palette above, settings and brushes below, layers beyond. A fisheye magnifies the cells near the pointer without moving what is under it.',
  howTo: {
    pen: 'Hover magnifies; tap a cell. Drag a Puck wedge: pan, zoom ↕, rotate around, size ↕. Drag a value ↕, or tap it for a clock of stops. Tap the selected layer for its actions, the current colour for a wheel.',
    touch:
      'Long-press the drawing, slide to a cell and lift. Or press and slide over the Hive, lift on a cell. Hold a value to unfold its stops.',
    mouse:
      'Right-click, or right-drag to a cell and release. The wheel steps values, turns the palette, zooms. Drag the palette middle ↕ tints–shades, ↔ hues.',
    keys: '1–8 tools · arrows, Enter · +/− step · Esc folds · hold Space, point, release to pick'
  },
  component: lazy(() => import('./HiveVariant'), { export: 'HiveVariant' })
};
