import { lazy } from 'solid-js';
import type { VariantInfo } from '../../kit/variant';

/** HUD: after Photoshop HUD brush and color · Procreate gestures. */
export const hud: VariantInfo = {
  id: 'hud',
  name: 'HUD',
  inspiredBy: 'Photoshop HUD brush and color · Procreate gestures',
  idea:
    'Almost no UI: a small ring with eight spokes appears on the drawing at the pen. Press toward a function and keep ' +
    'sliding: its strip opens right at the pen with the current value under it, so one stroke picks and sets it. ' +
    '→ Size, ↑ Opacity, ↗ Color, ↖ Tools, ↙ Layers, ↘ Presets, ← History, ↓ Zoom (diagonals mirror for the right ' +
    'hand). Drag the hub to pan, the ring around it to rotate. Lift to commit; lift back where it opened to change ' +
    'nothing. Two- and three-finger taps undo and redo.',
  howTo: {
    pen:
      'Side button opens it at the tip. Hover a spoke, press and slide along the strip, lift. With the side button ' +
      'held while touching, just flick. Hub: pan; ring: rotate; tap the hub for big labels.',
    touch:
      'Long-press and, without lifting, slide toward a function. Or lift and tap a label, then tap a value. Two fingers ' +
      'tap: Undo; three: Redo (also when closed).',
    mouse:
      'Hold the right button and flick, or right-click, then press-drag a spoke. Wheel over the hub zooms, over a ' +
      'label steps that value; drag the hub to pan, the ring to rotate.',
    keys: 'Arrows choose a direction (two together a diagonal), Tab cycles, Enter opens; arrows adjust, Enter keeps, Esc restores.'
  },
  component: lazy(() => import('./HudVariant'), { export: 'HudVariant' })
};
