import type { TreeMarqueeRect } from './createTreeMarqueeSelection';

/** Draws a drag-to-select rectangle inside the positioned scrolling element that renders the tree. */
export function TreeMarquee(props: { rect: TreeMarqueeRect }) {
  return (
    <div
      class="pointer-events-none absolute z-10 border border-sky-400 bg-sky-400/15"
      style={{
        top: `${props.rect.top}px`,
        left: `${props.rect.left}px`,
        width: `${props.rect.width}px`,
        height: `${props.rect.height}px`
      }}
      data-tree-marquee
      aria-hidden="true"
    />
  );
}
