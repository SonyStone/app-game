import { lazy } from 'solid-js';
import type { VariantInfo } from '../../kit/variant';

/** Deck: after Hearthstone hand of cards · Balatro · Stage Manager. */
export const deck: VariantInfo = {
  id: 'deck',
  name: 'Deck',
  inspiredBy: 'Hearthstone hand of cards · Balatro · Stage Manager',
  idea:
    'The panels are five cards (Navigate, Tools, Brush, Color, Layers) dealt in a fan around the pen. Point at a card ' +
    'to lift it, play it to bring it up full size at the pen, and keep the rest of the hand tucked behind it for ' +
    'switching. The deck remembers the last card and plays it straight away next time.',
  howTo: {
    pen: 'Hover over the fan to lift a card, tap to play it. On the full card: tap and drag the controls; tap a small card behind it to switch; drag the bare card down to put it back.',
    touch:
      'Long-press, then slide to a card and lift to play it. Or press on the fan and slide: the card under your finger rises, lifting plays it. Swipe the full card down for the hand, sideways for its neighbours.',
    mouse:
      'Hover to inspect, click to play. Right-button press, slide to a card, release. Wheel over a number, a zoom or rotate zone, the history bar or the hue strip.',
    keys: '1–5 play a card · ← → next card · Tab hand / last card · Enter plays the lifted card · per card: F H S R Z + − (Navigate), tool letters (Tools), ↑ ↓ presets (Brush), ↑ ↓ V N (Layers) · Esc closes'
  },
  component: lazy(() => import('./DeckVariant'), { export: 'DeckVariant' })
};
