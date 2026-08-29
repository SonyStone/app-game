import type { TreeDropFeedbackState } from './createTreeDragAndDrop';

/** Clearly marks whether a dragged item will be inserted before, inside, or after a tree row. */
export function TreeDropIndicator(props: { feedback: TreeDropFeedbackState }) {
  const isInside = () => props.feedback.placement === 'inside';
  const markerTop = () =>
    props.feedback.placement === 'after'
      ? props.feedback.rect.top + props.feedback.rect.height - 2
      : props.feedback.rect.top - 2;
  const label = () => `${props.feedback.effect} ${props.feedback.placement}`.toUpperCase();

  return (
    <>
      <div
        class={[
          'pointer-events-none fixed z-50 border-sky-300 bg-sky-400/20 shadow-[0_0_8px_rgb(56_189_248_/_0.8)]',
          { 'border-2': isInside(), 'h-1 border-x-2 border-y-0': !isInside() }
        ]}
        style={{
          top: `${isInside() ? props.feedback.rect.top : markerTop()}px`,
          left: `${props.feedback.rect.left}px`,
          width: `${props.feedback.rect.width}px`,
          height: isInside() ? `${props.feedback.rect.height}px` : undefined
        }}
      />
      <span
        class={[
          'pointer-events-none fixed z-50 h-3 w-3 rotate-45 border-2 border-sky-200 bg-sky-500',
          { hidden: isInside() }
        ]}
        style={{
          top: `${markerTop() - 4}px`,
          left: `${props.feedback.rect.left + 2}px`
        }}
      />
      <span
        class="pointer-events-none fixed z-50 rounded-sm border border-sky-200 bg-sky-700 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white shadow-md"
        style={{
          top: `${isInside() ? props.feedback.rect.top + 1 : markerTop() - 18}px`,
          left: `${props.feedback.rect.left + 18}px`
        }}
      >
        {label()}
      </span>
    </>
  );
}
