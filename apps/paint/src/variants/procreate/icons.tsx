/**
 * Line icons of Procreate's own controls that `SketchIcon` has no match for: the toolbar's wrench, Selection ribbon,
 * brush, eraser and layers, and the Actions tabs. Drawn on a 24-unit grid in the current color.
 */
export function ProcreateIcon(props: { name: ProcreateIconName; size?: number }) {
  return (
    <svg
      width={props.size ?? 24}
      height={props.size ?? 24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={paths[props.name]} />
    </svg>
  );
}

/** Names of the variant's icons. */
export type ProcreateIconName = keyof typeof paths;

const paths = {
  wrench:
    'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z',
  selection:
    'M17.5 6.2C16.2 4.8 14.3 4 12.2 4 9.2 4 7 5.6 7 8c0 5 10.5 3 10.5 8 0 2.4-2.3 4-5.3 4-2.2 0-4.2-.9-5.6-2.4',
  transform: 'M5.5 3.5 19 12l-6.6 1.8L9.3 20Z',
  brush:
    'm9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02Z',
  eraser: 'm7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21M22 21H7M5 11l9 9',
  layers: 'M9 9h11v11H9ZM15 9V4H4v11h5',
  add: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM12 8v8M8 12h8',
  canvas: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM3 16l5-5 4 4 3-3 6 6',
  share: 'M12 3v12M8 7l4-4 4 4M6 11H5v9h14v-9h-1',
  prefs: 'M7 7h10a5 5 0 0 1 0 10H7A5 5 0 0 1 7 7ZM7 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z',
  help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.4v.6M12 16.8v.1',
  chevron: 'm9 6 6 6-6 6',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  showInterface: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5'
} as const;
