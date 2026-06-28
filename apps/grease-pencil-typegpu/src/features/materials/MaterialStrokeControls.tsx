import { For } from 'solid-js'
import {
  materialStrokeModes,
  strokeCapStyles,
  strokeJoinStyles,
  type MaterialStrokeMode,
  type StrokeCapStyle,
  type StrokeJoinStyle,
} from '../../document'
import {
  capStyleLabels,
  joinStyleLabels,
  materialStrokeModeLabels,
  readMaterialStrokeMode,
  readStrokeCapStyle,
  readStrokeJoinStyle,
} from './materialOptions'

type MaterialStrokeControlsProps = {
  capStyle: StrokeCapStyle
  joinStyle: StrokeJoinStyle
  strokeMode: MaterialStrokeMode
  onSetCapStyle: (capStyle: StrokeCapStyle) => void
  onSetJoinStyle: (joinStyle: StrokeJoinStyle) => void
  onSetStrokeMode: (strokeMode: MaterialStrokeMode) => void
}

export function MaterialStrokeControls(props: MaterialStrokeControlsProps) {
  return (
    <div class="material-style-row">
      <label class="select-control">
        Mode
        <select
          name="material-stroke-mode"
          value={props.strokeMode}
          onChange={(event) =>
            props.onSetStrokeMode(readMaterialStrokeMode(event.currentTarget.value))
          }
        >
          <For each={materialStrokeModes}>
            {(strokeMode) => (
              <option value={strokeMode}>{materialStrokeModeLabels[strokeMode]}</option>
            )}
          </For>
        </select>
      </label>

      <label class="select-control">
        Cap
        <select
          name="material-cap-style"
          value={props.capStyle}
          onChange={(event) =>
            props.onSetCapStyle(readStrokeCapStyle(event.currentTarget.value))
          }
        >
          <For each={strokeCapStyles}>
            {(capStyle) => (
              <option value={capStyle}>{capStyleLabels[capStyle]}</option>
            )}
          </For>
        </select>
      </label>

      <label class="select-control">
        Join
        <select
          name="material-join-style"
          value={props.joinStyle}
          onChange={(event) =>
            props.onSetJoinStyle(readStrokeJoinStyle(event.currentTarget.value))
          }
        >
          <For each={strokeJoinStyles}>
            {(joinStyle) => (
              <option value={joinStyle}>{joinStyleLabels[joinStyle]}</option>
            )}
          </For>
        </select>
      </label>
    </div>
  )
}
