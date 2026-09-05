/** Small, consistent line icons for the sketchbook controls. */
export function SketchIcon(props: { name: keyof typeof paths; size?: number }) {
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
      <path d={paths[props.name]} />
    </svg>
  );
}

const paths = {
  move: 'M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3',
  zoom: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 6 6M7 10h6M10 7v6',
  rotate: 'M20 9a8 8 0 0 0-14-3L3 9m0-6v6h6M4 15a8 8 0 0 0 14 3l3-3m0 6v-6h-6',
  tools: 'M4 4h5v5H4ZM15 4h5v5h-5ZM4 15h5v5H4ZM15 15h5v5h-5Z',
  paper: 'M4 3h16v18H4ZM8 8h8M8 12h5',
  mirror: 'M12 2v20M3 5v14l6-7-6-7Zm18 0v14l-6-7 6-7Z',
  draw: 'm15 4 5 5M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15l-1 6 5-2',
  fill: 'm9 3 10 10-7 7a2 2 0 0 1-3 0l-6-6a2 2 0 0 1 0-3l7-7M5 13h14M20 17s-2 2-2 3a2 2 0 0 0 4 0c0-1-2-3-2-3',
  erase: 'm14 3 7 7a1 1 0 0 1 0 2l-9 9H7l-5-5a1 1 0 0 1 0-2L12 3a1 1 0 0 1 2 0ZM7 9l8 8M12 21h10',
  select: 'm5 3 14 9-7 2-3 7Z',
  edit: 'M6 6h12v12H6ZM3 3h6v6H3ZM15 15h6v6h-6Z',
  pan: 'M8 12V5a2 2 0 0 1 4 0v7-9a2 2 0 0 1 4 0v9-7a2 2 0 0 1 4 0v10c0 4-3 7-7 7h-1c-2 0-4-1-5-3l-4-6a2 2 0 0 1 3-2l2 2',
  orbit: 'M21 12a9 9 0 1 1-3-7M21 3v6h-6M12 7a5 5 0 0 1 0 10 5 5 0 0 1 0-10Z',
  layers: 'm12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 16l10 5 10-5',
  brush: 'm14 3 7 7-9 9-7-7ZM6 13c-4 0-4 5-4 8 3 0 8 0 8-4M12 5l7 7',
  scene: 'm12 2 9 5v10l-9 5-9-5V7Zm0 10v10M3 7l9 5 9-5M12 2v10',
  animation: 'M3 5h18v14H3ZM7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4',
  undo: 'M9 5 3 11l6 6M3 11h11a6 6 0 0 1 6 6',
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
  unlock: 'M6 10h12v11H6Zm2 0V6a4 4 0 0 1 8 0M12 14v3',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  up: 'm6 14 6-6 6 6',
  down: 'm6 10 6 6 6-6',
  book: 'M4 3h15v18H4ZM8 3v18M2 7h4M2 12h4M2 17h4M12 7h4'
} as const;
