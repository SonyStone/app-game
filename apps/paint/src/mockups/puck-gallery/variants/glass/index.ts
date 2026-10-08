import { lazy } from 'solid-js';
import type { VariantInfo } from '../../kit/variant';

/** Glass: after Procreate · iPadOS. */
export const glass: VariantInfo = {
  id: 'glass',
  name: 'Glass',
  inspiredBy: 'Procreate · iPadOS',
  idea: 'The familiar baseline: Procreate’s QuickMenu opens under the pen as the Puck, with its size and opacity sliders as capsules beside it, and Procreate’s popovers (tools, Brush Library and Studio, the color Disc, Layers) float around it as glass cards.',
  howTo: {
    pen: 'Side button opens. Press a ring button and drag to pan, zoom (up/down) or rotate (around the ring); with the button still held, flick toward a ring button and release. Drag the capsules for size and opacity.',
    touch:
      'Long-press opens; keep the finger down and slide toward a ring button. Tap to pick; swipe a layer left for Lock, Duplicate, Delete; drag a layer to reorder.',
    mouse:
      'Right-click opens (or right-drag toward a ring button and release). Wheel over a value, a capsule, Zoom, Rotate or Undo adjusts it; taps on either side of a fill step through presets.',
    keys: 'B brush · E eraser · S mixer · [ ] size · 1–3 hold and move the pointer to pan, zoom, rotate · 4 undo · 5 redo · 6 eyedropper · Esc closes (blend sheet and layer actions first).'
  },
  component: lazy(() => import('./GlassVariant'), { export: 'GlassVariant' })
};
