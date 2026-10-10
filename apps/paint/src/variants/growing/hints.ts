import type { Feature } from './growth';

/** What the arrival card of a control says, and the dock element it points at (its `data-anchor`). */
export type ArrivalHint = {
  title: string;
  /** One or two short lines: what the control is and how to use it. */
  text: string;
  anchor: string;
  /** A one-tap action the card offers, such as adding the first new layer. */
  action?: 'add-layer';
};

/** The welcome card and the arrival card of every control. */
export const arrivalHints: Record<Feature | 'welcome', ArrivalHint> = {
  welcome: {
    title: 'Just draw',
    text: 'More tools appear here as you need them. Tap with two fingers to undo, three to redo.',
    anchor: 'paint'
  },
  swatches: {
    title: 'Colors',
    text: 'Tap a swatch to paint with it. Hold a finger on the drawing to pick a color from it.',
    anchor: 'colors'
  },
  colorDisc: {
    title: 'Color disc',
    text: 'Tap the current color: turn the ring for the hue, drag inside for the shade. Recent colors are kept there.',
    anchor: 'colors'
  },
  size: {
    title: 'Size and opacity',
    text: 'Drag a number sideways to change it, or tap it to type. [ and ] change the size too.',
    anchor: 'size'
  },
  brushes: {
    title: 'Brushes',
    text: 'Tap the active brush or eraser again to choose what it paints with.',
    anchor: 'paint'
  },
  layers: {
    title: 'Want to draw on a new layer?',
    text: 'Paint on a layer of its own to change it later without touching what is below.',
    anchor: 'layers',
    action: 'add-layer'
  },
  layerBlend: {
    title: 'Layer opacity and blending',
    text: 'Open the layers: the active layer now has an opacity, a blend mode, alpha lock and clipping.',
    anchor: 'layers'
  },
  selection: {
    title: 'Selection',
    text: 'Draw around an area to select it; strokes then stay inside. More shapes beside the dock.',
    anchor: 'tool-selection'
  },
  transform: {
    title: 'Transform',
    text: 'Move, scale and rotate the layer or the selection. Tap again, or Enter, to apply.',
    anchor: 'tool-transform'
  },
  fill: {
    title: 'Fill',
    text: 'With a selection, tap inside it to fill it with the current color.',
    anchor: 'tool-fill'
  },
  gradient: {
    title: 'Gradient',
    text: 'With a selection, drag across it: the gradient runs from the current to the second color.',
    anchor: 'tool-gradient'
  },
  symmetry: {
    title: 'Symmetry',
    text: 'Strokes are mirrored around a guide. Tap to choose the kind of symmetry.',
    anchor: 'tool-symmetry'
  },
  view: {
    title: 'View',
    text: 'Your zoom: tap it to return to 100 %. Flip the view to check proportions, or reset it.',
    anchor: 'view'
  },
  export: {
    title: 'Save and export',
    text: 'The menu now saves the drawing, exports PNG or PSD, opens files and inserts images.',
    anchor: 'menu'
  }
};

/** Names of controls in the menu's list of controls still to come. */
export const featureNames: Record<Feature, string> = {
  swatches: 'Color swatches',
  colorDisc: 'Color disc and history',
  size: 'Size and opacity',
  brushes: 'Brush library',
  layers: 'Layers',
  layerBlend: 'Layer opacity and blending',
  selection: 'Selection',
  transform: 'Transform',
  fill: 'Fill',
  gradient: 'Gradient',
  symmetry: 'Symmetry',
  view: 'Zoom and view',
  export: 'Save and export'
};
