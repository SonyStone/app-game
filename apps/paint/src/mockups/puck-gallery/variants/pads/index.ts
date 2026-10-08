import { lazy } from 'solid-js';
import type { VariantInfo } from '../../kit/variant';

/** Pads: after Ableton Push · MPC · mixing consoles. */
export const pads: VariantInfo = {
  id: 'pads',
  name: 'Pads',
  inspiredBy: 'Ableton Push · MPC · mixing consoles',
  idea:
    'The cluster is a controller drawn flat: a 4×4 pad grid under the pen (navigation, the eight tools, history, view toggles), ' +
    'eight encoders with a screen for the tool’s numbers, colored pads for color, layers as mixer channel strips and a preset bank. ' +
    'Tool, color and preset pads close it unless LATCH is on; knobs, faders and toggles keep it open.',
  howTo: {
    pen: 'Hold Pan / Zoom / Rotate and drag anywhere (only the held pad stays); tap Zoom = 100 %, Rotate = 0°. Drag Undo/Redo sideways to scrub history. Drag knobs up/down; press a fader track to jump the cap.',
    touch:
      'Same as the pen: pads, knobs, faders and steppers are finger-sized. Drag a channel’s thumbnail sideways to scroll the mixer; double-tap a knob or fader to reset it.',
    mouse:
      'Wheel over a knob, fader, blend stepper, Zoom/Rotate or Undo/Redo pad turns it (Shift: fine). Shift-drag a knob or fader for fine control.',
    keys: 'Pads: 1–4 / Q–R / A–F / Z–V (hold 1/2/3 and move the pointer). Presets 5–0, − = bank. ←/→ pick an encoder, ↑/↓ turn, ⌫ reset. Y U I O soft keys. Tab channel, H mute, J solo, K lock, N new. T swap colors, L latch.'
  },
  component: lazy(() => import('./PadsVariant'), { export: 'PadsVariant' })
};
