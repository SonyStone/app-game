import { createMemo, createSignal, Show } from 'solid-js';
import type { DisplayImage } from '../gpu-viewport/displayTiles';
import { GpuViewport } from '../gpu-viewport/GpuViewport';
import { fitView, type View } from '../viewport/view';

/** Bounded mini-map shares resident display tiles and centers the camera on click or Enter. */
export function Navigator(props: {
  image: DisplayImage | undefined;
  document: { width: number; height: number };
  view: View;
  size: { width: number; height: number };
  onCenter: (point: { x: number; y: number }) => void;
}) {
  const [open, setOpen] = createSignal(false);
  const size = { width: 240, height: 100 };
  const map = createMemo(() => fitView(size, props.document));
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)} style={{ padding: '6px 10px', 'flex-shrink': 0 }}>
      <summary>Navigator</summary>
      <div style={{ position: 'relative', width: '240px', height: '100px', overflow: 'hidden' }}>
        <Show when={open() && props.image}>
          {(image) => <GpuViewport image={image()} view={map()} size={size} label="Navigator preview" />}
        </Show>
        <svg width="240" height="100" style={{ position: 'absolute', inset: 0, 'pointer-events': 'none' }}>
          <rect
            x={map().x - (props.view.x / props.view.scale) * map().scale}
            y={map().y - (props.view.y / props.view.scale) * map().scale}
            width={(props.size.width / props.view.scale) * map().scale}
            height={(props.size.height / props.view.scale) * map().scale}
            fill="none"
            stroke="#55c9ff"
            stroke-width="2"
          />
        </svg>
        <button
          aria-label="Center canvas using navigator"
          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'crosshair' }}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            props.onCenter(
              event.detail === 0
                ? { x: props.document.width / 2, y: props.document.height / 2 }
                : {
                    x: (event.clientX - rect.left - map().x) / map().scale,
                    y: (event.clientY - rect.top - map().y) / map().scale
                  }
            );
          }}
        />
      </div>
      <small>Resident coverage. Fit content uses saved-record bounds.</small>
    </details>
  );
}
