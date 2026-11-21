import { Show } from 'solid-js';

/**
 * Small, consistent line icons for the sketchbook controls. A few icons also have solid shapes (`solids`), drawn
 * filled in the same ink under their lines, where an outline alone would not read at 20 px.
 */
export function SketchIcon(props: { name: SketchIconName; size?: number }) {
  const solid = () => (solids as Partial<Record<SketchIconName, string>>)[props.name];

  return (
    <svg
      width={props.size ?? 20}
      height={props.size ?? 20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.65"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <Show when={solid()}>{(shape) => <path d={shape()} fill="currentColor" stroke="none" />}</Show>
      <path d={paths[props.name]} />
    </svg>
  );
}

/** Names of the available icons. */
export type SketchIconName = keyof typeof paths;

/** A board of checks, transparency as editors show it, in the icons' top left corner. */
const checks = 'M2 2h3.5v3.5H2ZM9 2h3.5v3.5H9ZM5.5 5.5H9V9H5.5ZM2 9h3.5v3.5H2ZM9 9h3.5v3.5H9Z';

const paths = {
  pin: 'm9 3 9 9-3 1-3 4-2-2-6 6 6-6-2-2 4-3Z',
  lasso: 'M7 17C2 15 2 9 6 5c4-3 13-2 15 3s-2 9-8 10M8 15c-4 0-5 4-2 5s6-2 4-4c-1-1-2-1-2-1Zm-2 5c-1 2-3 2-4 1',
  fullscreen: 'M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5',
  fullscreenExit: 'M3 8h5V3M16 3v5h5M21 16h-5v5M8 21v-5H3',
  move: 'M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3',
  zoom: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 6 6M7 10h6M10 7v6',
  rotate: 'M20 9a8 8 0 0 0-14-3L3 9m0-6v6h6M4 15a8 8 0 0 0 14 3l3-3m0 6v-6h-6',
  tools: 'M4 4h5v5H4ZM15 4h5v5h-5ZM4 15h5v5H4ZM15 15h5v5h-5Z',
  paper: 'M4 3h16v18H4ZM8 8h8M8 12h5',
  quickshape: 'M3 17 9 5l6 12ZM15 6h6v6h-6ZM4 21h16',
  pressure: 'M4 3v17h17M4 20C15 20 9 4 21 4',
  symmetry:
    'M12 3v18M12 9C9 2 2 2 3 9c0 3 4 4 9 3C5 11 3 16 5 20c3 2 5-2 7-6M12 9c3-7 10-7 9 0 0 3-4 4-9 3 7-1 9 4 7 8-3 2-5-2-7-6',
  mirror: 'M12 2v20M3 5v14l6-7-6-7Zm18 0v14l-6-7 6-7Z',
  draw: 'm15 4 5 5M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15l-1 6 5-2',
  fill: 'm9 3 10 10-7 7a2 2 0 0 1-3 0l-6-6a2 2 0 0 1 0-3l7-7M5 13h14M20 17s-2 2-2 3a2 2 0 0 0 4 0c0-1-2-3-2-3',
  erase: 'm14 3 7 7a1 1 0 0 1 0 2l-9 9H7l-5-5a1 1 0 0 1 0-2L12 3a1 1 0 0 1 2 0ZM7 9l8 8M12 21h10',
  select: 'm5 3 14 9-7 2-3 7Z',
  edit: 'M6 6h12v12H6ZM3 3h6v6H3ZM15 15h6v6h-6Z',
  pan: 'M8 12V5a2 2 0 0 1 4 0v7-9a2 2 0 0 1 4 0v9-7a2 2 0 0 1 4 0v10c0 4-3 7-7 7h-1c-2 0-4-1-5-3l-4-6a2 2 0 0 1 3-2l2 2',
  orbit: 'M21 12a9 9 0 1 1-3-7M21 3v6h-6M12 7a5 5 0 0 1 0 10 5 5 0 0 1 0-10Z',
  folder: 'M3 5h7l2 3h9v12H3Z',
  mergeDown: 'M5 3h14v5H5ZM12 9v7m-3-3 3 3 3-3M4 20h16',
  layers: 'm12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 16l10 5 10-5',
  brush: 'm14 3 7 7-9 9-7-7ZM6 13c-4 0-4 5-4 8 3 0 8 0 8-4M12 5l7 7',
  scene: 'm12 2 9 5v10l-9 5-9-5V7Zm0 10v10M3 7l9 5 9-5M12 2v10',
  animation: 'M3 5h18v14H3ZM7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4',
  undo: 'M9 5 3 11l6 6M3 11h11a6 6 0 0 1 6 6',
  localUndo: 'M10 7 6 11l4 4M6 11h7a4 4 0 0 1 0 8h-2M3 4h2M8 4h2M13 4h2M18 4h2M21 7v2M21 12v2',
  redo: 'm15 5 6 6-6 6m6-6H10a6 6 0 0 0-6 6',
  gradient: 'M4 4h16v16H4ZM8 4v16M12 4v16M15.5 4v16M18.5 4v16',
  numbers: 'M10 4 8 20M16 4l-2 16M5 9h15M4 15h15',
  distort: 'M7 5l11-1 2 15-16 1ZM7 5a1 1 0 1 0 0 .1M18 4a1 1 0 1 0 0 .1M20 19a1 1 0 1 0 0 .1M4 20a1 1 0 1 0 0 .1',
  warp: 'M4 5c5 3 11-3 16 0M4 12c5 3 11-3 16 0M4 19c5 3 11-3 16 0M4 5v14M12 6v14M20 5v14',
  perspective: 'M8 5h8l5 14H3ZM12 5v14M5.5 12h13',
  selectRect: 'M4 6h3M10 6h4M17 6h3v3M20 12v3M20 18v0h-3M14 18h-4M7 18H4v-3M4 12V9',
  selectEllipse: 'M12 5c4.5 0 8 3 8 7M20 12c0 4-3.5 7-8 7M12 19c-4.5 0-8-3-8-7M4 12c0-4 3.5-7 8-7',
  selectPolygon: 'M5 19 8 5l9 4 2 10ZM5 19h.01M8 5h.01M17 9h.01M19 19h.01',
  magicWand: 'M4 20 15 9l-2-2L2 18ZM17 3v4M15 5h4M20 9v3M18.5 10.5h3M11 2v2M10 3h2',
  selectNew: 'M5 5h14v14H5Z',
  selectAdd: 'M4 4h10v6h6v10H10v-6H4Z',
  selectSubtract: 'M4 4h10v6h-4v4H4ZM13 13h7v7h-7Z',
  selectIntersect: 'M4 4h10v10H4ZM10 10h10v10H10ZM10 13l3-3M10 14h4v-4',
  selectInvert: 'M3 3h18v18H3ZM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM3 9l6-6M15 21l6-6M3 15 6 12M18 12l3-3',
  feather: 'M20 4c-8 0-14 6-14 14v2M6 18 16 8M9 14h6M12 10h5',
  selectAll: 'M4 4h3M10 4h4M17 4h3v3M20 10v4M20 17v3h-3M14 20h-4M7 20H4v-3M4 14v-4M4 7V4M8 8h8v8H8Z',
  fillSelection: 'M5 5h14v14H5ZM5 9l4-4M5 14l9-9M5 19 19 5M10 19l9-9M15 19l4-4',
  picker: 'm14 7 3 3M5 19l1-4 9-9 3 3-9 9-4 1Zm9-15 2-1 5 5-1 2-3 1-4-4 1-3Z',
  close: 'm6 6 12 12M6 18 18 6',
  more: 'M5 11v2M12 11v2M19 11v2',
  home: 'm3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  left: 'm15 5-7 7 7 7',
  right: 'm9 5 7 7-7 7',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  hidden: 'm3 3 18 18M9 5c7-2 13 7 13 7l-3 4M15 19C8 21 2 12 2 12l3-4',
  lock: 'M6 10h12v11H6Zm2 0V6a4 4 0 0 1 8 0v4M12 14v3',
  /* An arrow hooked down onto the layer below it. */
  clip: 'M4 4h8a3 3 0 0 1 3 3v6m-3-3 3 3 3-3M3 17h18v4H3Z',
  check: 'm5 12 5 5 9-11',
  cut: 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8.5 7.5 20 19M8.5 16.5 20 5',
  paste: 'M9 3h6v3H9ZM7 4.5H5V21h14V4.5h-2M9 12h6M9 16h4',
  newLayer: 'm12 3 10 5-10 5L2 8Zm-10 9 10 5 4-2M19 15v6M16 18h6',
  flipVertical: 'M2 12h20M5 3v6l7-6H5Zm0 18v-6l7 6H5Zm14-18v6l-7-6h7Zm0 18v-6l-7 6h7Z',
  proportions: 'M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6M14 4h6v6M10 20H4v-6',
  pixels: 'M4 4h6v6H4ZM14 4h6v6h-6ZM4 14h6v6H4ZM14 14h6v6h-6Z',
  reset: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4',
  unlock: 'M6 10h12v11H6Zm2 0V6a4 4 0 0 1 8 0M12 14v3',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  copy: 'M8 8h12v12H8ZM4 16V4h12',
  grip: 'M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01',
  up: 'm6 14 6-6 6 6',
  down: 'm6 10 6 6 6-6',
  book: 'M4 3h15v18H4ZM8 3v18M2 7h4M2 12h4M2 17h4M12 7h4',
  options:
    'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1',
  sliders: 'M4 7h9M17 7h3M15 5v4M4 17h3M11 17h9M9 15v4',
  sizes:
    'M4 18.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M8 13.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M13 7a4 4 0 1 0 8 0a4 4 0 1 0-8 0',
  bars: 'M4 15h3v5H4ZM10.5 10h3v10h-3ZM17 4h3v16h-3Z',
  scatter:
    'M4.7 6a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0-2.6 0M11.7 5a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0-2.6 0M17.7 8a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0-2.6 0M7.7 12a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0-2.6 0M14.7 13a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0-2.6 0M3.7 18a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0-2.6 0M10.7 19a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0-2.6 0M17.7 18a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0-2.6 0',
  texture: 'M4 4h16v16H4ZM4 9c3-2 5 2 8 0s5 2 8 0M4 15c3-2 5 2 8 0s5 2 8 0',
  dualTip: 'M4 12a5 5 0 1 0 10 0a5 5 0 1 0-10 0M10 12a5 5 0 1 0 10 0a5 5 0 1 0-10 0',
  hue: 'M4 12a8 8 0 1 0 16 0a8 8 0 1 0-16 0M12 12V4M12 12l6.9 4M12 12l-6.9 4',
  tilt: 'M4 20h16M8 20l8-16M14 20a6 6 0 0 0-3.3-5.4',
  bristles: 'M9 21h6l-1-6h-4ZM10 15 6 4M11 15 10 3M13 15l1-12M14 15l4-11',
  pencil: 'M8 21V9l4-6 4 6v12M8 9h8M11 4.5h2',
  /* Transparency (the checks of `solids`) under a padlock, shut or open: lock transparent pixels, not the layer. */
  alphaLock: 'M12 15h10v7H12ZM14 15v-2.5a3 3 0 0 1 6 0V15',
  alphaUnlock: 'M12 15h10v7H12ZM14 15v-4a3 3 0 0 1 6 0',
  /* An artist's palette with dabs of paint: mixing colors, not picking one. */
  mixing:
    'M12 3a9 9 0 0 0 0 18c1.4 0 2-.8 2-1.8 0-1.4-1.2-1.6-1.2-2.8 0-1 .8-1.6 2-1.6H17a4 4 0 0 0 4-4c0-4.4-4-7.8-9-7.8ZM6.6 11.5a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0-2.4 0M9.8 7a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0-2.4 0M14.8 7.6a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0-2.4 0',
  /* A text field holding a T, a caret standing out of it: a name to type. */
  rename: 'M13 7H3v10h10M19 7h2v10h-2M6 10h5M8.5 10v4.5M16 4.5v15M14.5 4.5h3M14.5 19.5h3',
  /* A clock turned back: the colors used before. */
  recent: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4M12 8v4.5l3 2'
} as const;

/** The filled shapes some icons draw under their lines (see `SketchIcon`). */
const solids = {
  alphaLock: checks,
  alphaUnlock: checks
};
