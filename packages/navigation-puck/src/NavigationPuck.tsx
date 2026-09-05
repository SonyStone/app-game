import { For, Show } from 'solid-js';
import puckImage from './assets/navigation-puck.svg?url';
import type { createNavigationPuck, PuckAction } from './controller';
import './style.css';

/** Shared 2D/3D controls that hide while a captured pointer navigates the canvas. */
export function NavigationPuck(props: {
  navigation: ReturnType<typeof createNavigationPuck>;
  focusTarget: () => HTMLElement;
}) {
  const close = () => {
    props.navigation.close();
    props.focusTarget().focus({ preventScroll: true });
  };
  const pointer = (event: PointerEvent) => ({
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    shiftKey: event.shiftKey
  });
  const begin = (event: PointerEvent, mode: PuckAction) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget as HTMLElement;
    target.focus({ preventScroll: true });
    if (props.navigation.begin(mode, pointer(event))) target.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent) => props.navigation.move(pointer(event));
  const end = (event: PointerEvent) => {
    props.navigation.end(event.pointerId);
    if (!props.navigation.center()) close();
  };
  const nudge = (event: KeyboardEvent, mode: PuckAction) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    props.navigation.nudge(
      mode,
      event.key === 'ArrowLeft' ? -12 : event.key === 'ArrowRight' ? 12 : 0,
      event.key === 'ArrowUp' ? -12 : event.key === 'ArrowDown' ? 12 : 0
    );
  };
  return (
    <Show when={props.navigation.center()}>
      <div class="shared-puck-overlay" data-navigating={props.navigation.activeAction() ? 'true' : 'false'}>
        <button class="shared-puck-dismiss" aria-label="Dismiss navigation puck" onPointerDown={close} />
        <div
          class="shared-puck"
          data-mode={props.navigation.mode()}
          role="group"
          aria-label="Canvas navigation"
          data-active={props.navigation.activeAction() ? 'true' : 'false'}
          style={{
            left: `${props.navigation.center()!.x}px`,
            top: `${props.navigation.center()!.y}px`,
            width: `${props.navigation.diameter()}px`,
            height: `${props.navigation.diameter()}px`
          }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <Show
            when={props.navigation.mode() === '2d'}
            fallback={
              <div class="shared-puck-zones">
                <For each={zones}>
                  {(zone) => (
                    <button
                      class="shared-puck-zone"
                      aria-label={zone.label}
                      title={zone.label}
                      onPointerDown={(e) => begin(e, zone.action)}
                      onPointerMove={move}
                      onPointerUp={(e) => {
                        move(e);
                        end(e);
                      }}
                      onPointerCancel={(e) => props.navigation.cancel(e.pointerId)}
                      onLostPointerCapture={(e) => props.navigation.cancel(e.pointerId)}
                      onKeyDown={(e) => nudge(e, zone.action)}
                    >
                      <svg
                        width="38"
                        height="38"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.6"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d={zone.path} />
                      </svg>
                    </button>
                  )}
                </For>
              </div>
            }
          >
            <img src={puckImage} alt="" draggable={false} />
            <button
              class="shared-puck-rotate"
              aria-label="Drag to rotate"
              title="Rotate around canvas center · Shift: 15° steps"
              onPointerDown={(e) => begin(e, 'rotate')}
              onPointerMove={move}
              onPointerUp={(e) => {
                move(e);
                end(e);
              }}
              onPointerCancel={(e) => props.navigation.cancel(e.pointerId)}
              onLostPointerCapture={(e) => props.navigation.cancel(e.pointerId)}
              onKeyDown={(e) => nudge(e, 'rotate')}
            />
            <button
              class="shared-puck-pan"
              aria-label="Drag to pan"
              title="Move canvas · drag or arrow keys"
              onPointerDown={(e) => begin(e, 'pan')}
              onPointerMove={move}
              onPointerUp={(e) => {
                move(e);
                end(e);
              }}
              onPointerCancel={(e) => props.navigation.cancel(e.pointerId)}
              onLostPointerCapture={(e) => props.navigation.cancel(e.pointerId)}
              onKeyDown={(e) => nudge(e, 'pan')}
            />
            <button
              class="shared-puck-zoom"
              aria-label="Drag to zoom"
              title="Zoom · drag up/down or arrow keys"
              onPointerDown={(e) => begin(e, 'zoom')}
              onPointerMove={move}
              onPointerUp={(e) => {
                move(e);
                end(e);
              }}
              onPointerCancel={(e) => props.navigation.cancel(e.pointerId)}
              onLostPointerCapture={(e) => props.navigation.cancel(e.pointerId)}
              onKeyDown={(e) => nudge(e, 'zoom')}
            />
          </Show>
          <button class="shared-puck-close" aria-label="Close navigation" title="Close · Escape" onClick={close}>
            <Show when={props.navigation.mode() === '3d'}>×</Show>
          </button>
        </div>
      </div>
    </Show>
  );
}

const zones = [
  { action: 'zoom', label: 'Zoom view', path: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 6 6M7 10h6M10 7v6' },
  {
    action: 'rotate',
    label: 'Rotate view',
    path: 'M20 9a8 8 0 0 0-14-3L3 9m0-6v6h6M4 15a8 8 0 0 0 14 3l3-3m0 6v-6h-6'
  },
  {
    action: 'pan',
    label: 'Pan view',
    path: 'M8 12V5a2 2 0 0 1 4 0v7-9a2 2 0 0 1 4 0v9-7a2 2 0 0 1 4 0v10c0 4-3 7-7 7h-1c-2 0-4-1-5-3l-4-6a2 2 0 0 1 3-2l2 2'
  },
  { action: 'orbit', label: 'Orbit view', path: 'm12 2 9 5v10l-9 5-9-5V7Zm0 10v10M3 7l9 5 9-5M12 2v10' }
] as const satisfies readonly { action: PuckAction; label: string; path: string }[];
