import type { Component } from 'solid-js';

/** Props every Paint variant accepts. */
export type PaintVariantProps = {
  /** Link back to the embedding playground; omitted on standalone pages. */
  experimentsHref?: string;
};

/**
 * A complete Paint program: one drawing session (`features/session`) with a UI of its own. Variants share the engine,
 * the feature controllers and, unless they say otherwise, the saved drawing, and differ in presentation. Each one is
 * loaded on first use.
 */
export type PaintVariant = {
  /** The playground route under `/paint` and the hash of the dev page `variants.html`. */
  id: string;
  name: string;
  /** One line about what the variant is for, shown in variant lists. */
  description: string;
  load: () => Promise<Component<PaintVariantProps>>;
};

/** Every Paint variant, in the order variant lists show them. */
export const paintVariants: PaintVariant[] = [
  {
    id: 'studio',
    name: 'Classic',
    description: 'The current editor: toolbar, side panels, radial menu and developer tools.',
    load: () => import('../features/studio/PaintStudio').then(({ PaintStudio }) => PaintStudio)
  },
  {
    id: 'procreate',
    name: 'Procreate',
    description: 'A close copy of Procreate on the iPad, as the reference everyone already knows.',
    load: () => import('./procreate').then(({ ProcreateStudio }) => ProcreateStudio)
  },
  {
    id: 'puck',
    name: 'Puck',
    description: 'Only the canvas; everything opens as one glass cluster under the pen.',
    load: () => import('./puck').then(({ PuckStudio }) => PuckStudio)
  },
  {
    id: 'desktop',
    name: 'Desktop',
    description: 'A docked desktop workspace after Blender and Photoshop: menus, a tool column and panels, for mouse, keyboard and pen.',
    load: () => import('./desktop').then(({ DesktopStudio }) => DesktopStudio)
  },
  {
    id: 'zen',
    name: 'Zen',
    description: 'An empty page and one pebble; everything else is a gesture.',
    load: () => import('./zen').then(({ ZenStudio }) => ZenStudio)
  },
  {
    id: 'hands',
    name: 'Two hands',
    description: 'The free hand holds tools under its fingers while the pen draws, like a painter holding a palette.',
    load: () => import('./hands').then(({ HandsStudio }) => HandsStudio)
  },
  {
    id: 'growing',
    name: 'Growing',
    description: 'Starts with a brush and an eraser; tools appear once you reach for them.',
    load: () => import('./growing').then(({ GrowingStudio }) => GrowingStudio)
  },
  {
    id: 'palette',
    name: 'Palette',
    description: "A painter's mixing palette beside the drawing: colors come from paint you mix, not from a picker.",
    load: () => import('./palette').then(({ PaletteStudio }) => PaletteStudio)
  },
  {
    id: 'command',
    name: 'Command',
    description: 'No buttons: type, or say, what you want.',
    load: () => import('./command').then(({ CommandStudio }) => CommandStudio)
  }
];

/**
 * Feature demos: one feature each on a drawing of its own, with only that feature's controls, to show or try the
 * feature without the rest of an editor around it. Listed apart from the variants, which are whole editors.
 */
export const featureDemos: PaintVariant[] = [
  {
    id: 'demo-fill',
    name: 'Fill',
    description: 'Only the fill, on prepared line art.',
    load: () => import('./demos').then(({ FillDemo }) => FillDemo)
  },
  {
    id: 'demo-symmetry',
    name: 'Symmetry',
    description: 'Only symmetry: strokes repeated around guides.',
    load: () => import('./demos').then(({ SymmetryDemo }) => SymmetryDemo)
  },
  {
    id: 'demo-gradient',
    name: 'Gradient',
    description: 'Only the gradient tool.',
    load: () => import('./demos').then(({ GradientDemo }) => GradientDemo)
  }
];
