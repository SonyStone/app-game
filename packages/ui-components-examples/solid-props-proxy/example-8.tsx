import { PropsProxy } from '@app-game/solid-props-proxy';
import { Accessor, createSignal } from 'solid-js';
import { Vec2, of as vec2 } from './vec2';

export function PropsProxyExample8() {
  const [target, setTarget] = createSignal<HTMLElement | undefined>(undefined);

  createDragSensor(target);

  return (
    <div class="flex flex-col gap-3 bg-neutral-950 p-2 text-white">
      <PropsProxy target={document.body} class="bg-gray-700" />
      <div class="flex gap-2">
        <button ref={setTarget} class="rounded bg-blue-600 px-2 py-1 text-white hover:bg-blue-700">
          Drag Me
        </button>
      </div>
    </div>
  );
}

function createDragSensor(target: Accessor<HTMLElement | undefined>) {
  const [currestState, setCurrentState] = createSignal<'idle' | 'dragging'>('idle');
  const [delta, setDelta] = createSignal<Vec2>(vec2(0, 0));

  let currentTarget: HTMLElement | null = null;
  const state = {
    origin: vec2(0, 0),
    delta: vec2(0, 0)
  };

  <PropsProxy
    target={target()}
    {...{
      idle: {
        'data-state': 'idle',
        onPointerDown(event: PointerEvent & { currentTarget: HTMLElement }) {
          currentTarget = event.currentTarget;
          currentTarget.setPointerCapture(event.pointerId);
          state.origin = vec2(event.clientX, event.clientY);
          setDelta(vec2(0, 0));
          setCurrentState('dragging');
        }
      },
      dragging: {
        class: 'ring-2 ring-orange-500 ',
        'data-state': 'dragging',
        get style() {
          return {
            transform: `translateX(${delta()?.x ?? 0}px)`
          };
        },
        onPointerMove(event: PointerEvent) {
          const pos = vec2(event.clientX, event.clientY);
          const delta = vec2(pos.x - state.origin.x, pos.y - state.origin.y);
          setDelta(delta);
        },
        onPointerUp(event: PointerEvent) {
          setCurrentState('idle');
          currentTarget?.releasePointerCapture(event.pointerId);
        },
        onPointerCancel(event: PointerEvent) {
          setCurrentState('idle');
          currentTarget?.releasePointerCapture(event.pointerId);
        }
      }
    }[currestState()]}
  />;
}
