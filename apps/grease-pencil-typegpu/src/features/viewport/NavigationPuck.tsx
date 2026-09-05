import { For, Show } from 'solid-js';
import { SketchIcon } from '../../shared/SketchIcon';
import type { ViewportMode } from '../../shared/viewportMode';
import type { createNavigationPuck, PuckAction } from './createNavigationPuck';

/** A four-zone navigation puck. Drags keep working outside its bounds through pointer capture. */
export function NavigationPuck(props: {
  navigation: ReturnType<typeof createNavigationPuck>;
  mode: ViewportMode;
  onClose: () => void;
}) {
  const pointer = (event: PointerEvent) => ({
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    shiftKey: event.shiftKey
  });
  return (
    <Show when={props.navigation.center()}>
      {(center) => (
        <div
          class="navigation-puck-overlay"
          data-navigating={props.navigation.activeAction() ? 'true' : 'false'}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button
            class="navigation-puck-dismiss"
            type="button"
            aria-label="Dismiss navigation puck"
            onPointerDown={props.onClose}
            onClick={props.onClose}
          />
          <div
            class="navigation-puck"
            role="group"
            aria-label={`${props.mode.toUpperCase()} navigation puck`}
            style={{ left: `${center().x}px`, top: `${center().y}px` }}
          >
            <div class="navigation-puck-zones">
              <For each={puckZones}>
                {(zone) => (
                  <button
                    class="navigation-puck-zone"
                    type="button"
                    data-active={props.navigation.activeAction() === zone.action ? 'true' : 'false'}
                    aria-label={zone.label}
                    title={zone.hint}
                    disabled={zone.action === 'orbit' && props.mode === '2d'}
                    onPointerDown={(event) => {
                      if (event.button !== 0) return;
                      if (zone.action === 'orbit' && props.mode === '2d') return;
                      event.preventDefault();
                      event.currentTarget.focus({ preventScroll: true });
                      if (props.navigation.begin(zone.action, pointer(event)))
                        event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerMove={(event) => props.navigation.move(pointer(event))}
                    onPointerUp={(event) => {
                      props.navigation.move(pointer(event));
                      props.navigation.end(event.pointerId);
                      if (!props.navigation.center()) props.onClose();
                    }}
                    onPointerCancel={(event) => props.navigation.cancel(event.pointerId)}
                    onLostPointerCapture={(event) => props.navigation.cancel(event.pointerId)}
                    onKeyDown={(event) => {
                      const delta = arrowDelta(event.key);
                      if (!delta || (zone.action === 'orbit' && props.mode === '2d')) return;
                      event.preventDefault();
                      props.navigation.nudge(zone.action, delta[0], delta[1]);
                    }}
                  >
                    <SketchIcon name={zone.icon} size={38} />
                  </button>
                )}
              </For>
            </div>
            <span class="navigation-puck-center" aria-hidden="true" />
            <button
              class="navigation-puck-close"
              type="button"
              aria-label="Close navigation puck"
              title="Close · Esc"
              onClick={props.onClose}
            >
              <SketchIcon name="close" size={22} />
            </button>
          </div>
        </div>
      )}
    </Show>
  );
}

const puckZones = [
  { action: 'zoom', label: 'Zoom view', hint: 'Zoom · drag up or down', icon: 'zoom' },
  { action: 'rotate', label: 'Rotate view', hint: 'Rotate around viewport center · Shift: 15° steps', icon: 'rotate' },
  { action: 'pan', label: 'Pan view', hint: 'Pan · drag in any direction', icon: 'pan' },
  { action: 'orbit', label: 'Orbit view', hint: 'Orbit · drag in any direction · Shift: 15° steps', icon: 'scene' }
] as const satisfies readonly {
  action: PuckAction;
  label: string;
  hint: string;
  icon: Parameters<typeof SketchIcon>[0]['name'];
}[];

function arrowDelta(key: string): readonly [number, number] | undefined {
  switch (key) {
    case 'ArrowLeft':
      return [-12, 0];
    case 'ArrowRight':
      return [12, 0];
    case 'ArrowUp':
      return [0, -12];
    case 'ArrowDown':
      return [0, 12];
  }
}
