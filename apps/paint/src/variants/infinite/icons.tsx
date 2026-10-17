/**
 * Thin line icons after Infinite Painter's: the top bar, the main toolbar, the tools and options menus, the layer
 * panel and the color and brush panels. Drawn on a 24-unit grid in the current color; `size` is in CSS pixels, 24 by
 * default.
 */
export function InfiniteIcon(props: { name: InfiniteIconName; size?: number }) {
  return (
    <svg
      width={props.size ?? 24}
      height={props.size ?? 24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={paths[props.name]} />
    </svg>
  );
}

/** Names of the variant's icons. */
export type InfiniteIconName = keyof typeof paths;

const paths = {
  // Top bar.
  home: 'M4 11 12 4l8 7M6 9.5V20h4.5v-5h3v5H18V9.5',
  creativeTools: 'M12 3.5v2M12 5.5 6.5 20M12 5.5 17.5 20M8.3 15h7.4',
  editingTools: 'M11 5H5v14h14v-6M17.5 3.5l3 3L12 15H9v-3Z',
  layers: 'M12 4 3.5 8.5 12 13l8.5-4.5ZM3.5 12.5 12 17l8.5-4.5M3.5 16.5 12 21l8.5-4.5',
  more: 'M5.5 12h.01M12 12h.01M18.5 12h.01',
  reference: 'M15 4.5 19.5 9 16 12.5l1 4-1.5 1.5L6 8.5 7.5 7l4 1ZM9.5 14.5 4.5 19.5',
  settings:
    'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2.1-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2.1 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2.1 1.2L10 21h4l.5-2.6a7 7 0 0 0 2.1-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z',
  selectionToggle: 'M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z',
  // Main toolbar and history.
  brush: 'M19.5 4.5 11 13M11 13l-1.5-1.5M11 13c0 2.5-2 4.5-4.5 4.5H4.5c1-1 1-2 1-3a3 3 0 0 1 4-2.5',
  blend: 'M6.5 8.5c0-2.5 3-3.5 5-2.5s4.5-.5 6 1.5-.5 4-2 5 .5 3.5-1.5 5-4.5 0-6-1.5-4-.5-4-3 2.5-2 2.5-4.5Z',
  eraser: 'm8 20-4-4 10-10 6 6-8 8ZM9 11l6 6M8 20h12',
  eyedropper:
    'm14 7 3 3M19.5 4.5a2.1 2.1 0 0 0-3 0L13 8l3 3 3.5-3.5a2.1 2.1 0 0 0 0-3ZM14.5 9.5 6 18l-1.5 1.5L4 20l.5-.5L6 18',
  undo: 'M9 8 5 12l4 4M5 12h9.5a4.5 4.5 0 0 1 0 9H12',
  redo: 'm15 8 4 4-4 4M19 12H9.5a4.5 4.5 0 0 0 0 9H12',
  history: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM12 8v4.5l3 2',
  close: 'M6 6l12 12M18 6 6 18',
  // Creative Tools: fills.
  fill: 'M5 12.5 11.5 6l6.5 6.5-6.5 6.5ZM9 4l2.5 2M18 12.5h1.5M19.5 15.5s-1.5 2-1.5 3a1.5 1.5 0 0 0 3 0c0-1-1.5-3-1.5-3Z',
  gradient: 'M5 12.5 11.5 6l6.5 6.5-6.5 6.5ZM8.5 9l6.5 6.5M7 11l5.5 5.5',
  pattern: 'M5 12.5 11.5 6l6.5 6.5-6.5 6.5ZM9.5 10.5h.01M13.5 10.5h.01M11.5 14.5h.01M9 4l2.5 2',
  clone: 'M8 16a3 3 0 1 0 0 0ZM10.5 13.5 19 5M14 5h5v5',
  // Guides.
  lines: 'M5 19 19 5M4 15l5 5M15 4l5 5',
  ellipse: 'M12 4c4.5 0 7 3.6 7 8s-2.5 8-7 8-7-3.6-7-8 2.5-8 7-8Z',
  hatching: 'M5 15 15 5M8 18 18 8M11 21l9-9M4 10l6-6',
  lazy: 'M14 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10ZM14 9h.01M10.5 12.5 4 19',
  pen: 'M5 19c2-6 6-8 9-11M14 8l2-2 2 2-2 2ZM5 19h.01M18 5l1-1',
  // Shapes.
  line: 'M5 19 19 5',
  rectangle: 'M5 5h14v14H5Z',
  circle: 'M12 4.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Z',
  path: 'M5 18c2-8 5-8 7-4s5 4 7-4M5 18h.01M19 10h.01',
  arc: 'M5 17A7 7 0 0 1 19 17M12 7v.01',
  // Symmetry.
  vertical: 'M12 3v18M9 8c-2 0-4 2-4 4s2 4 4 4M15 8c2 0 4 2 4 4s-2 4-4 4',
  horizontal: 'M3 12h18M8 9c0-2 2-4 4-4s4 2 4 4M8 15c0 2 2 4 4 4s4-2 4-4',
  radial:
    'M12 12m-1 0a1 1 0 1 0 2 0 1 1 0 1 0-2 0M12 4v4M12 16v4M4 12h4M16 12h4M6.3 6.3l2.8 2.8M14.9 14.9l2.8 2.8M6.3 17.7l2.8-2.8M14.9 9.1l2.8-2.8',
  kaleido: 'M12 4 6 7.5v9L12 20l6-3.5v-9ZM12 4v16M6 7.5l12 9M18 7.5l-12 9',
  // Perspective.
  onePoint: 'M3 6h18v12H3ZM12 12 3 6M12 12l9-6M12 12 3 18M12 12l9 6',
  twoPoints: 'M8 6v12M16 6v12M8 6 3 11M8 18l-5-5M16 6l5 5M16 18l5-5M8 6h8M8 18h8',
  threePoints: 'M12 3 5 10v6l7 5 7-5v-6ZM12 3v18M5 10l7 4 7-4',
  curvilinear:
    'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM12 4c-3 2.5-3 13.5 0 16M12 4c3 2.5 3 13.5 0 16M4 12c2.5-3 13.5-3 16 0M4 12c2.5 3 13.5 3 16 0',
  isometric: 'M12 3 4 7.5v9L12 21l8-4.5v-9ZM4 7.5l8 4.5 8-4.5M12 12v9',
  grid: 'M4 4h16v16H4ZM9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16',
  // Camera.
  fit: 'M12 4a8 8 0 1 0 8 8M12 4V2M12 4l2-2',
  flip: 'M12 3v18M9 6 4 18h5ZM15 6l5 12h-5Z',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6Z',
  navigator: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM15 9l-2 4.5L9 15l2-4.5Z',
  // Editing Tools: select.
  lasso: 'M7 13c-2-1-3-2.5-3-4C4 6 7.5 4 12 4s8 2 8 5-3.5 5-8 5c-1.5 0-3-.2-4.2-.6M7 13c-1 1-1 2.5 0 3.5s0 3-1.5 3.5',
  selectRect: 'M5 5h2M10 5h4M17 5h2v2M19 10v4M19 17v2h-2M14 19h-4M7 19H5v-2M5 14v-4M5 7V5',
  wand: 'M4 20 14 10M15 4v2M15 12v2M20 9h-2M12 9h-2M18.5 5.5 17 7M18.5 12.5 17 11',
  selectBrush: 'M19.5 4.5 11 13M11 13c0 2.5-2 4.5-4.5 4.5H4.5c1-1 1-2 1-3a3 3 0 0 1 4-2.5M15 19h1M18 19h2',
  polyline: 'M4 18 8 7l5 8 3-9 4 12',
  selectPath: 'M5 18c2-8 5-8 7-4s5 4 7-4M4 6h2M8 6h2M14 6h2M18 6h2',
  selectCircle: 'M12 4.5v1M16.5 6l-.7.7M19.5 12h-1M16.5 18l-.7-.7M12 19.5v-1M7.5 18l.7-.7M4.5 12h1M7.5 6l.7.7',
  colorRange: 'M12 4c3 4 5 6.5 5 9a5 5 0 0 1-10 0c0-2.5 2-5 5-9ZM4 20h3M10 20h4M17 20h3',
  // Transform.
  move: 'M12 3v18M3 12h18M12 3 9.5 5.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5',
  anchor: 'M5 5h4M15 5h4v4M19 15v4h-4M9 19H5v-4M5 9V5M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
  distort: 'M4 7 18 4l2 16-15-3Z',
  warp: 'M4 6c5-2 11 2 16 0v13c-5 2-11-2-16 0ZM4 12c5-2 11 2 16 0',
  // Edit.
  adjust: 'M12 4c3 4 5 6.5 5 9a5 5 0 0 1-10 0c0-2.5 2-5 5-9ZM12 18a5 5 0 0 1-5-5',
  filters: 'M6 4h12v16H6ZM9 4v3M15 4v3M9 17v3M15 17v3M10 12l1.5 1.5L15 10',
  curves: 'M4 4h16v16H4ZM4 20c6 0 4-10 8-10s3-6 8-6',
  liquify: 'M12 4c-4 3-6 5-6 8a6 6 0 0 0 12 0c0-1.5-.5-3-2-4.5M12 12c-1.5 1-1 3 0 3s2-1 1.5-2.5',
  // Pattern.
  patternSymmetry:
    'M12 12m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0M12 4v4M12 16v4M5 8l3.5 2M15.5 14 19 16M5 16l3.5-2M15.5 10 19 8',
  patternPath: 'M4 19c4-1 8-5 10-10M8 17l1.5-1M11 14l1.5-1.5M13.5 10.5 15 8.5M16 7l1.5-2.5',
  quilt: 'M4 4h7v7H4ZM13 4h7v7h-7ZM4 13h7v7H4ZM13 13h7v7h-7Z',
  tile: 'M7 4v16M17 4v16M4 7h16M4 17h16',
  // Canvas.
  crop: 'M7 3v14h14M3 7h14v14',
  resize: 'M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6',
  straighten: 'M4 17 20 7M4 20h16M7 20a4 4 0 0 0-1-3',
  panels: 'M4 4h16v16H4ZM11 4v9M4 13h16M14 13v7',
  // Options menu.
  plus: 'M12 5v14M5 12h14',
  open: 'M4 6h6l2 2h8v11H4Z',
  save: 'M5 4h11l3 3v13H5ZM8 4v5h7V4M8 20v-6h8v6',
  import: 'M12 4v11M8 11l4 4 4-4M5 15v5h14v-5',
  record: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  export: 'M12 15V4M8 8l4-4 4 4M5 15v5h14v-5',
  community:
    'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.5 19c.5-3 2.5-5 5.5-5s5 2 5.5 5M16 11a2.5 2.5 0 1 0 0-5M17.5 14c2 .5 3 2.5 3 5',
  classroom: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.4v.6M12 16.8v.1',
  // Layer panel and layer options.
  eye: 'M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6ZM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z',
  eyeOff: 'M2.5 12s3.5-6 9.5-6c1.6 0 3 .4 4.3 1M21.5 12s-3.5 6-9.5 6c-1.6 0-3-.4-4.3-1M4 20 20 4',
  adjustmentLayer: 'M12 4a8 8 0 1 0 0 16ZM12 4a8 8 0 0 1 0 16M16.5 3.5v3M15 5h3',
  group: 'M4 6h6l2 2h8v11H4ZM4 10h16',
  duplicate: 'M8 8h11v12H8ZM5 16V4h11',
  clear: 'M6 4h8l4 4v12H6ZM14 4v4h4M9 14h6',
  alphaLock: 'M8 11V8a4 4 0 0 1 8 0v3M7 11h10v9H7ZM12 14.5v2',
  merge: 'M7 4v4l5 5 5-5V4M12 13v7M9 17l3 3 3-3',
  delete: 'M5 7h14M10 4h4M7 7l1 13h8l1-13M10 11v6M14 11v6',
  clip: 'M8 4v9a4 4 0 0 0 4 4h8M16 13l4 4-4 4',
  select: 'M12 4 4 8.5 12 13l8-4.5ZM4 12.5 12 17l8-4.5',
  mask: 'M5 5h14v14H5ZM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z',
  paper: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM9 10h.01M14 9h.01M15 14h.01M10 15h.01',
  // Color panel.
  wheel: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  sliders: 'M4 8h9M17 8h3M4 16h3M11 16h9M15 6v4M9 14v4',
  swatches: 'M5 5h4v4H5ZM10 5h4v4h-4ZM15 5h4v4h-4ZM5 10h4v4H5ZM10 10h4v4h-4ZM15 10h4v4h-4ZM5 15h4v4H5ZM10 15h4v4h-4Z',
  orb: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM9 8.5a2 2 0 1 0 0 0',
  // Brush selector.
  folders: 'M4 5h4v14H4ZM10 5h10M10 9h10M10 13h10M10 17h6',
  heart: 'M12 19s-7-4.4-7-9.5A3.8 3.8 0 0 1 12 7.7a3.8 3.8 0 0 1 7 1.8C19 14.6 12 19 12 19Z',
  brushSettings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
  recent: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM12 8v4.5l3 2',
  download: 'M12 4v11M8 11l4 4 4-4M5 20h14',
  chevronRight: 'm9 6 6 6-6 6',
  chevronLeft: 'm15 6-6 6 6 6',
  chevronDown: 'm6 9 6 6 6-6',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  // Color panel (color agent).
  back: 'M19 12H5M11 6l-6 6 6 6',
  sun: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4'
} as const;
