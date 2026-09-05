/** Only one inspector is open at a time, including on narrow screens. */
export type SketchPanel = 'layers' | 'brush' | 'scene' | 'animation';

/** Labels shared by inspector launchers and panel headings. */
export const sketchPanels = [
  { id: 'layers', label: 'Layers' },
  { id: 'brush', label: 'Brush' },
  { id: 'scene', label: 'Scene' },
  { id: 'animation', label: 'Frames' }
] as const satisfies readonly { id: SketchPanel; label: string }[];
