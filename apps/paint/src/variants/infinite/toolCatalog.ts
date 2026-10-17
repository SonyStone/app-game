import type { InfiniteIconName } from './icons';

/**
 * Infinite Painter's tools menus as the manual lists them (pp. 37–38), section by section and in its order, so that
 * the variant shows the whole menu as Infinite Painter has it. Which entries Paint can run, and what they do, is the
 * studio's business (`createToolActions`); a menu shows the rest disabled. Paint's own tools that Infinite Painter
 * lacks are appended to the nearest section.
 */
export const creativeTools = [
  {
    title: 'Tools',
    items: [
      { id: 'fill', label: 'Fill', icon: 'fill' },
      { id: 'gradient', label: 'Gradient', icon: 'gradient' },
      { id: 'pattern', label: 'Pattern', icon: 'pattern' },
      { id: 'clone', label: 'Clone', icon: 'clone' }
    ]
  },
  {
    title: 'Guides',
    items: [
      { id: 'lines', label: 'Lines', icon: 'lines' },
      { id: 'ellipse', label: 'Ellipse', icon: 'ellipse' },
      { id: 'hatching', label: 'Hatching', icon: 'hatching' },
      { id: 'lazy', label: 'Lazy', icon: 'lazy' },
      { id: 'pen', label: 'Pen', icon: 'pen' }
    ]
  },
  {
    title: 'Shapes',
    items: [
      { id: 'line', label: 'Line', icon: 'line' },
      { id: 'rectangle', label: 'Rectangle', icon: 'rectangle' },
      { id: 'circle', label: 'Circle', icon: 'circle' },
      { id: 'path', label: 'Path', icon: 'path' },
      { id: 'arc', label: 'Arc', icon: 'arc' }
    ]
  },
  {
    title: 'Symmetry',
    items: [
      { id: 'vertical', label: 'Vertical', icon: 'vertical' },
      { id: 'horizontal', label: 'Horizontal', icon: 'horizontal' },
      { id: 'radial', label: 'Radial', icon: 'radial' },
      { id: 'kaleido', label: 'Kaleido', icon: 'kaleido' }
    ]
  },
  {
    title: 'Perspective',
    items: [
      { id: 'one-point', label: '1 Point', icon: 'onePoint' },
      { id: 'two-points', label: '2 Points', icon: 'twoPoints' },
      { id: 'three-points', label: '3 Points', icon: 'threePoints' },
      { id: 'curvilinear', label: 'Curvilinear', icon: 'curvilinear' },
      { id: 'isometric', label: 'Isometric', icon: 'isometric' },
      { id: 'grid', label: 'Grid', icon: 'grid' }
    ]
  },
  {
    title: 'Camera',
    items: [
      { id: 'fit', label: 'Fit', icon: 'fit' },
      { id: 'flip', label: 'Flip', icon: 'flip' },
      { id: 'lock', label: 'Lock', icon: 'lock' },
      { id: 'navigator', label: 'Navigator', icon: 'navigator' }
    ]
  }
] as const satisfies readonly ToolSection[];

/** The Editing Tools menu (manual p. 38), with Paint's local undo appended to Edit. */
export const editingTools = [
  {
    title: 'Select',
    items: [
      { id: 'select-lasso', label: 'Lasso', icon: 'lasso' },
      { id: 'select-rect', label: 'Rect', icon: 'selectRect' },
      { id: 'select-wand', label: 'Wand', icon: 'wand' },
      { id: 'select-brush', label: 'Brush', icon: 'selectBrush' },
      { id: 'select-poly', label: 'Poly', icon: 'polyline' },
      { id: 'select-path', label: 'Path', icon: 'selectPath' },
      { id: 'select-circle', label: 'Circle', icon: 'selectCircle' },
      { id: 'select-color', label: 'Color', icon: 'colorRange' }
    ],
    wrap: true
  },
  {
    title: 'Transform',
    items: [
      { id: 'transform', label: 'Basic', icon: 'move' },
      { id: 'transform-anchor', label: 'Anchor', icon: 'anchor' },
      { id: 'transform-distort', label: 'Distort', icon: 'distort' },
      { id: 'transform-warp', label: 'Warp', icon: 'warp' }
    ]
  },
  {
    title: 'Edit',
    items: [
      { id: 'adjust', label: 'Color', icon: 'adjust' },
      { id: 'filters', label: 'Filters', icon: 'filters' },
      { id: 'curves', label: 'Curves', icon: 'curves' },
      { id: 'liquify', label: 'Liquify', icon: 'liquify' },
      { id: 'local-undo', label: 'Local undo', icon: 'history' }
    ]
  },
  {
    title: 'Pattern',
    items: [
      { id: 'pattern-symmetry', label: 'Symmetry', icon: 'patternSymmetry' },
      { id: 'pattern-path', label: 'Path', icon: 'patternPath' },
      { id: 'quilt', label: 'Quilt', icon: 'quilt' },
      { id: 'tile', label: 'Tile', icon: 'tile' }
    ]
  },
  {
    title: 'Canvas',
    items: [
      { id: 'crop', label: 'Crop', icon: 'crop' },
      { id: 'resize', label: 'Resize', icon: 'resize' },
      { id: 'straighten', label: 'Straighten', icon: 'straighten' },
      { id: 'panels', label: 'Panels', icon: 'panels' }
    ]
  }
] as const satisfies readonly ToolSection[];

/** The Options menu (manual p. 407): project handling, data exchange and help, three by three. */
export const optionsItems = [
  { id: 'new', label: 'New', icon: 'plus' },
  { id: 'open', label: 'Open', icon: 'open' },
  { id: 'save', label: 'Save', icon: 'save' },
  { id: 'import', label: 'Import', icon: 'import' },
  { id: 'record', label: 'Record', icon: 'record' },
  { id: 'export', label: 'Export', icon: 'export' },
  { id: 'community', label: 'Community', icon: 'community' },
  { id: 'classroom', label: 'Classroom', icon: 'classroom' },
  { id: 'settings', label: 'Settings', icon: 'settings' }
] as const satisfies readonly ToolItem[];

/** One entry of a tools menu: an icon with its label under it. */
export type ToolItem = { id: string; label: string; icon: InfiniteIconName };

/**
 * A titled section of a tools menu. Its entries show four to a row; a longer row scrolls sideways behind a chevron, as
 * Infinite Painter's do, unless `wrap` breaks it into rows of four (Select).
 */
export type ToolSection = { title: string; items: readonly ToolItem[]; wrap?: boolean };

/** Every entry of both tools menus and of the Options menu, which the custom toolbar can dock. */
export type ToolId =
  | (typeof creativeTools)[number]['items'][number]['id']
  | (typeof editingTools)[number]['items'][number]['id']
  | (typeof optionsItems)[number]['id'];

/** The entry `id` of any menu, for the custom toolbar's docked icons; `undefined` for an unknown id. */
export function findTool(id: string): ToolItem | undefined {
  return allTools.get(id);
}

const allTools = new Map<string, ToolItem>(
  [...creativeTools, ...editingTools]
    .flatMap((section) => section.items as readonly ToolItem[])
    .concat(optionsItems)
    .map((item) => [item.id, item])
);
