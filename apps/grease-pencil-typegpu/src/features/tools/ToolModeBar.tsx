import { For } from 'solid-js'
import { toolModeOptions, type ToolMode } from './toolMode'

type ToolModeBarProps = {
  mode: ToolMode
  onSetMode: (mode: ToolMode) => void
}

export function ToolModeBar(props: ToolModeBarProps) {
  return (
    <div class="segmented-control">
      <For each={toolModeOptions}>
        {(option) => (
          <button
            class={`tool-button ${
              props.mode === option.mode ? 'tool-button-active' : ''
            }`}
            type="button"
            onClick={() => props.onSetMode(option.mode)}
            title={option.title}
          >
            {option.label}
          </button>
        )}
      </For>
    </div>
  )
}
