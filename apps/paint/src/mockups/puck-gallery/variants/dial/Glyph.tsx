import { Show } from 'solid-js';
import { SketchIcon, type SketchIconName } from '../../../../shared/ui/SketchIcon';

/**
 * A thin line icon: the app's `SketchIcon` set plus the few the dial adds (size, opacity, setting, color, history,
 * fit), drawn in the same 24-unit grid and stroke so that both sets mix.
 */
export function Glyph(props: { name: GlyphName; size?: number }) {
  const own = () => (props.name in ownPaths ? ownPaths[props.name as keyof typeof ownPaths] : undefined);

  return (
    <Show when={own()} fallback={<SketchIcon name={props.name as SketchIconName} size={props.size ?? 18} />}>
      {(path) => (
        <svg
          width={props.size ?? 18}
          height={props.size ?? 18}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.65"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d={path()} />
        </svg>
      )}
    </Show>
  );
}

/** Any icon `Glyph` draws. */
export type GlyphName = SketchIconName | keyof typeof ownPaths;

const ownPaths = {
  size: 'M3 15a2 2 0 1 0 4 0 2 2 0 1 0-4 0M10 12a5.5 5.5 0 1 0 11 0 5.5 5.5 0 1 0-11 0',
  opacity: 'M12 4a8 8 0 1 0 0 16 8 8 0 1 0 0-16M12 4v16M12 7.5h4.5M12 11h7.5M12 14.5h7M12 18h4',
  tune: 'M4 7h9M17 7h3M15 4.5v5M4 17h3M11 17h9M9 14.5v5',
  drop: 'M12 3.5s6 6.3 6 10.5a6 6 0 0 1-12 0c0-4.2 6-10.5 6-10.5Z',
  history: 'M3.5 12a8.5 8.5 0 1 0 2.5-6M3.5 3.5V8H8M12 7.5V12l3 2',
  fit: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5M9 9h6v6H9Z'
} as const;
