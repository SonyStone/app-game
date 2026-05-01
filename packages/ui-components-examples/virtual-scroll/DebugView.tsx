import { access, MaybeAccessor } from '@solid-primitives/utils';

export function DebugView(props: {
  totalHeight: MaybeAccessor<number>;
  viewportHeight: MaybeAccessor<number>;
  scrollPosition: MaybeAccessor<number>;
  visibleCount: MaybeAccessor<number>;
  buffer: MaybeAccessor<number>;
  startIndex: MaybeAccessor<number>;
  endIndex: MaybeAccessor<number>;
  paddingTop: MaybeAccessor<number>;
  paddingBottom: MaybeAccessor<number>;
}) {
  return (
    <div class="bg-warmGray z-1 absolute start-20 rounded border bg-gray-200 p-2">
      <code>
        <pre>Total Height: {access(props.totalHeight)}</pre>
        <pre>Viewport Height: {access(props.viewportHeight)}</pre>
        <pre>Scroll Position: {access(props.scrollPosition)}</pre>
        <pre>Visible Count: {access(props.visibleCount)}</pre>
        <pre>Buffer: {access(props.buffer)}</pre>
        <pre>
          Indexes: {access(props.startIndex)} {access(props.endIndex)}
        </pre>
        <pre>Items in viewport: {access(props.endIndex) - access(props.startIndex)}</pre>
        <pre>Padding Top: {access(props.paddingTop)}</pre>
        <pre>Padding Bottom: {access(props.paddingBottom)}</pre>
      </code>
    </div>
  );
}
