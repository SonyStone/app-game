import type { JSX } from '@solidjs/web';
import { For, Show } from 'solid-js';
import { KIND_COLORS, TEAM_COLORS } from './draw';
import type { ShapeKind } from './MapCanvas';
import { TOOLS, type Tool } from './tools';

/**
 * The column of tools at the left of the editor, and under it the kind the rectangle and
 * polygon tools draw, while one of them is active.
 */
export function Toolbar(props: {
  tool: Tool;
  onTool: (tool: Tool) => void;
  shapeKind: ShapeKind;
  onShapeKind: (kind: ShapeKind) => void;
}) {
  return (
    <nav class="flex w-12 flex-col items-center gap-1 border-0 border-r border-solid border-[#333] bg-[#202020] py-2">
      <For each={TOOLS}>
        {(tool) => (
          <>
            <Show when={tool.id === 'crate' || tool.id === 'red-spawn' || tool.id === 'hand'}>
              <div class="my-1 h-px w-7 bg-[#383838]" />
            </Show>
            <button
              type="button"
              title={`${tool.label} (${tool.key})`}
              aria-label={tool.label}
              aria-pressed={props.tool === tool.id ? 'true' : 'false'}
              onClick={() => props.onTool(tool.id)}
              class={[
                'grid h-9 w-9 cursor-pointer place-items-center rounded-lg border-0 transition-colors',
                props.tool === tool.id ? 'bg-[#ffb020] text-[#1b1b1b]' : 'bg-transparent text-[#cfcfcf] hover:bg-[#333]'
              ]}
            >
              <ToolIcon tool={tool.id} />
            </button>
          </>
        )}
      </For>
      <Show when={props.tool === 'rectangle' || props.tool === 'polygon'}>
        <div class="my-1 h-px w-7 bg-[#383838]" />
        <For each={SHAPE_KINDS}>
          {(kind) => (
            <button
              type="button"
              title={`Draw ${kind}s`}
              aria-label={`Draw ${kind}s`}
              aria-pressed={props.shapeKind === kind ? 'true' : 'false'}
              onClick={() => props.onShapeKind(kind)}
              class={[
                'grid h-8 w-8 cursor-pointer place-items-center rounded-lg border-2 border-solid bg-transparent',
                props.shapeKind === kind ? 'border-[#ffb020]' : 'border-transparent hover:border-[#4a4a4a]'
              ]}
            >
              <span
                class="block h-4 w-4 rounded-sm border border-solid border-black"
                style={{ background: KIND_COLORS[kind] }}
              />
            </button>
          )}
        </For>
      </Show>
    </nav>
  );
}

const SHAPE_KINDS: ShapeKind[] = ['building', 'wall', 'park', 'water'];

/** 20 px line icon of a tool. */
function ToolIcon(props: { tool: Tool }) {
  const icons: Record<Tool, () => JSX.Element> = {
    select: () => <path d="M5 3l11 6.5-5 1.2 3 5.3-2.2 1.2-3-5.3L5 15.5z" fill="currentColor" stroke="none" />,
    rectangle: () => <rect x="3.5" y="5" width="13" height="10" rx="1" />,
    polygon: () => <path d="M4 14l2-9 6 2 4-3 1 9-7 3z" />,
    road: () => (
      <>
        <path d="M3 16c4-1 5-11 14-12" stroke-width="4" opacity="0.45" />
        <path d="M3 16c4-1 5-11 14-12" stroke-dasharray="2 2" />
      </>
    ),
    crate: () => (
      <>
        <rect x="6" y="2.5" width="8" height="15" rx="0.8" />
        <path d="M6 2.5l8 15M14 2.5l-8 15" />
      </>
    ),
    'red-spawn': () => <SpawnIcon color={TEAM_COLORS.red.line} />,
    'blue-spawn': () => <SpawnIcon color={TEAM_COLORS.blue.line} />,
    capture: () => (
      <>
        <circle cx="10" cy="10" r="7" stroke-dasharray="3 2" />
        <path d="M8 14V5.5l5 2-5 2" fill="currentColor" />
      </>
    ),
    hand: () => (
      <path d="M7 10V5a1.2 1.2 0 012.4 0v4V3.8a1.2 1.2 0 012.4 0V9 5a1.2 1.2 0 012.4 0v6c0 3.5-2 6-5 6-2.3 0-3.4-1.2-4.6-3L3.5 11a1.2 1.2 0 012-1.3z" />
    )
  };

  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linejoin="round"
      stroke-linecap="round"
    >
      {icons[props.tool]()}
    </svg>
  );
}

function SpawnIcon(props: { color: string }) {
  return (
    <>
      <rect
        x="3"
        y="4"
        width="14"
        height="12"
        rx="1.5"
        fill={props.color}
        fill-opacity="0.35"
        stroke={props.color}
        stroke-dasharray="3 2"
      />
      <path d="M10 7v6M7 10h6" stroke={props.color} />
    </>
  );
}
