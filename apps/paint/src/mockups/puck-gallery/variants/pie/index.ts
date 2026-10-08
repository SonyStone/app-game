import { lazy } from 'solid-js';
import type { VariantInfo } from '../../kit/variant';

/** Pie: after Blender pie menus · Maya marking menus. */
export const pie: VariantInfo = {
  id: 'pie',
  name: 'Pie',
  inspiredBy: 'Blender pie menus · Maya marking menus',
  idea:
    'Everything is chosen by direction, so each target is a whole 45° wedge of the screen: flick without looking. ' +
    'The main pie is the Puck; Tools, Color, Brush and Layers open their own pies under the pointer.',
  howTo: {
    pen: 'Hover toward an item and tap anywhere in that direction, or press, slide into a direction and lift. Press Zoom or Rotate and drag; drag the middle to pan.',
    touch:
      'Long-press to open, keep the finger down and slide into a direction, or lift and tap an item. Drag on Zoom, Rotate or the middle to navigate.',
    mouse:
      'Hold the right button, move toward an item and release (a marking menu), or click it. Drag a value sideways; tap it for a pie of presets.',
    keys: 'Hold Space, point, release to choose. 1–9 as on a keypad (8 up, 4 left), arrows point, Enter runs, Esc / Backspace go back. T C B L open submenus.'
  },
  component: lazy(() => import('./PieVariant'), { export: 'PieVariant' })
};
