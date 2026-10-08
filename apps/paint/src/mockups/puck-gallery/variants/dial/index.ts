import { lazy } from 'solid-js';
import type { VariantInfo } from '../../kit/variant';

/** Dial: after Surface Dial · iPod click wheel · Wacom Touch Ring. */
export const dial: VariantInfo = {
  id: 'dial',
  name: 'Dial',
  inspiredBy: 'Surface Dial · iPod click wheel · Wacom Touch Ring',
  idea:
    'One rotary control does almost everything: pick what to adjust on its rim (size, opacity, a setting, color, ' +
    'brush, tool, layer, history, zoom, rotation), then turn it, detent by detent. Turning history back is undo. ' +
    'Tools, view buttons and colors orbit the dial; a card beside it shows the mode. Closed, a mini-dial stays on screen.',
  howTo: {
    pen:
      'Tap a rim icon, then circle on the track to turn (or tap its left / right side for one step). Tap the hub for ' +
      'the next mode; drag the hub to pan. The chip below the hub: ✓ done, eye, fit, 0°. Pen button held + circling ' +
      'turns and finishes on lift.',
    touch:
      'Same as the pen: circle a finger on the track, tap its sides to step, drag the hub to pan. A long press that ' +
      'keeps circling turns the dial. The mini-dial is the way in: tap it to open there, drag it to park it.',
    mouse:
      'Wheel over the dial (or the mini-dial, without opening) turns it; wheel over a card row turns that value. ' +
      'Drag around the track; right-drag in a circle right after opening turns and finishes on release.',
    keys: '[ ] or ← → one detent · ↑ ↓ or Tab change mode · 1–9, 0 pick a mode · Enter or Esc closes.'
  },
  component: lazy(() => import('./DialVariant'), { export: 'DialVariant' })
};
