import { For, Show } from 'solid-js';
import type { Point } from './geometry';

export type CursorOverlayPath = {
  readonly d: string;
  readonly dashArray?: string;
  readonly id: string;
  readonly stroke: string;
};

export type TouchPointerView = {
  readonly id: string;
  readonly isPrimary: boolean;
  readonly point: Point;
};

export function CursorOverlay(props: {
  readonly cursor?: Point;
  readonly paths: readonly CursorOverlayPath[];
  readonly touchPointers: readonly TouchPointerView[];
}) {
  return (
    <svg aria-hidden="true" class="pointer-events-none fixed inset-0 z-30 h-screen w-screen overflow-visible">
      <For each={props.paths}>
        {(path) => (
          <path
            d={path.d}
            fill="none"
            stroke={path.stroke}
            stroke-dasharray={path.dashArray ?? '7 9'}
            stroke-linecap="round"
            stroke-width="2"
          />
        )}
      </For>

      <Show when={props.cursor}>
        {(cursor) => (
          <g filter="drop-shadow(0 2px 2px rgb(0 0 0 / 0.28))" transform={`translate(${cursor().x} ${cursor().y})`}>
            <path
              d="M0 0 0 31 8.5 23 14 35 20.5 32 15 20 26 20Z"
              fill="#ffffff"
              stroke="#18181b"
              stroke-linejoin="round"
              stroke-width="2"
            />
            <circle cx="0" cy="0" fill="#ef4444" r="3.5" />
          </g>
        )}
      </Show>

      <For each={props.touchPointers}>{(pointer) => <TouchPointerMarker pointer={pointer} />}</For>
    </svg>
  );
}

function TouchPointerMarker(props: { readonly pointer: TouchPointerView }) {
  return (
    <g
      filter="drop-shadow(0 2px 2px rgb(0 0 0 / 0.22))"
      transform={`translate(${props.pointer.point.x} ${props.pointer.point.y})`}
    >
      <circle fill={props.pointer.isPrimary ? '#f43f5e' : '#06b6d4'} fill-opacity="0.18" r="24" />
      <circle fill="#ffffff" r="12" stroke={props.pointer.isPrimary ? '#be123c' : '#0e7490'} stroke-width="3" />
      <circle fill={props.pointer.isPrimary ? '#be123c' : '#0e7490'} r="4" />
    </g>
  );
}
