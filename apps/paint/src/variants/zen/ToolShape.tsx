import type { JSX } from '@solidjs/web';
import type { ToolShape as Shape } from './tools';

/**
 * A drawing tool drawn as its silhouette, tip down, in quiet grey line work; the part that leaves paint takes `ink`.
 * The fan rotates each tool so that its tip points away from the pebble. `eraser` draws a block eraser.
 */
export function ToolShape(props: { shape: Shape | 'eraser'; ink: string; size?: number }) {
  const height = () => props.size ?? 40;

  return (
    <svg
      width={(height() * 24) / 40}
      height={height()}
      viewBox="0 0 24 40"
      fill="none"
      stroke="currentColor"
      stroke-width="1.2"
      stroke-linejoin="round"
      stroke-linecap="round"
      aria-hidden="true"
    >
      {shapes[props.shape](props.ink)}
    </svg>
  );
}

/** Each tool's drawing; `ink` fills the part that paints. */
const shapes: Record<Shape | 'eraser', (ink: string) => JSX.Element> = {
  pencil: (ink) => (
    <>
      <path d="M8.5 3.5h7v23h-7z" fill="var(--zen-tool-body)" />
      <path d="M11 3.5v23M13 3.5v23" stroke-width="0.6" opacity="0.5" />
      <path d="M8.5 26.5 12 36.5l3.5-10z" fill="var(--zen-tool-wood)" />
      <path d="M10.6 32.5 12 36.5l1.4-4z" fill={ink} stroke={ink} />
    </>
  ),
  pen: (ink) => (
    <>
      <path d="M9 3h6v16H9z" fill="var(--zen-tool-body)" />
      <path d="M9 19h6l1.6 4.5L12 37.5 7.4 23.5z" fill="var(--zen-tool-wood)" />
      <path d="M12 26v8.5" />
      <circle cx="12" cy="25.5" r="1" fill="currentColor" stroke="none" />
      <path d="M10.9 34.2 12 37.5l1.1-3.3z" fill={ink} stroke={ink} />
    </>
  ),
  marker: (ink) => (
    <>
      <path d="M7 3.5h10v20H7z" fill="var(--zen-tool-body)" />
      <path d="M8 23.5h8v5H8z" fill="var(--zen-tool-wood)" />
      <path d="M9.5 28.5h5l-.8 7.5h-3.4z" fill={ink} stroke={ink} />
      <path d="M7 8h10" stroke-width="0.6" opacity="0.5" />
    </>
  ),
  brush: (ink) => (
    <>
      <path d="M10.8 2.5h2.4l.6 17h-3.6z" fill="var(--zen-tool-body)" />
      <path d="M9.4 19.5h5.2l-.4 6H9.8z" fill="var(--zen-tool-wood)" />
      <path d="M9.8 25.5c-.6 4.5.6 8.6 2.2 12 1.6-3.4 2.8-7.5 2.2-12z" fill={ink} stroke={ink} />
    </>
  ),
  airbrush: (ink) => (
    <>
      <path d="M8.5 5.5h7v18l-1.8 5h-3.4l-1.8-5z" fill="var(--zen-tool-body)" />
      <path d="M15.5 10.5h2.5v3h-2.5" />
      <path d="M11 28.5h2v3h-2z" fill="var(--zen-tool-wood)" />
      <circle cx="12" cy="34.5" r="0.9" fill={ink} stroke="none" />
      <circle cx="10" cy="36.5" r="0.7" fill={ink} stroke="none" />
      <circle cx="14" cy="36.5" r="0.7" fill={ink} stroke="none" />
      <circle cx="12" cy="38" r="0.6" fill={ink} stroke="none" />
    </>
  ),
  eraser: () => (
    <>
      <path d="M7.5 9.5h9v26a1.5 1.5 0 0 1-1.5 1.5h-6a1.5 1.5 0 0 1-1.5-1.5z" fill="var(--zen-tool-body)" />
      <path d="M7.5 17.5h9" />
      <path d="M7.5 9.5h9v8h-9z" fill="var(--zen-tool-wood)" />
    </>
  )
};
