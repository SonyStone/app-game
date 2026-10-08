import { lazy } from 'solid-js';
import type { VariantInfo } from '../../kit/variant';

/** Command: after Raycast · Figma quick actions · Nuke Tab menu. */
export const command: VariantInfo = {
  id: 'command',
  name: 'Command',
  inspiredBy: 'Raycast · Figma quick actions · Nuke Tab menu',
  idea:
    'A command palette under the pointer: search on top, the Puck as a row of big chips, then one grouped list of ' +
    'everything (Recent, Tools, Brushes, Color, Settings, Layers, View). Type to filter fuzzily or to run commands ' +
    'with arguments: size 40, op 50, hard 80, #ff8800, zoom 200, rot 45, blend multiply, hide sketch, undo 5. ' +
    'Every numeric row is a scrubber: drag it sideways.',
  howTo: {
    pen:
      'Tap a row to run it. Drag the list up/down to scroll; drag a value row (size, opacity, hue, layer) sideways ' +
      'to scrub it, or tap it and use ‹ ›. Press-drag Pan / Zoom / Rotate; hold Undo to repeat. Tap the field to type.',
    touch:
      'Same as the pen: tap runs, vertical drags scroll (with a fling), sideways drags on value rows scrub. The ' +
      'field stays unfocused, so no keyboard pops up until you tap it. Scope tabs jump to a group.',
    mouse:
      'Right-click opens it with the field focused: type, or hover and click. Wheel scrolls; wheel over a value (or ' +
      'sideways) steps it. Click a layer’s blend chip to list the blend modes, its eye to hide it.',
    keys:
      'Space opens it (release keeps it open) — type at once. ↑↓ select, Tab / ⇧Tab jump groups, ←→ step the ' +
      'selected value or swatch, Enter runs, Esc clears then closes, Ctrl/⌘Z undoes from the field.'
  },
  component: lazy(() => import('./CommandVariant'), { export: 'CommandVariant' })
};
