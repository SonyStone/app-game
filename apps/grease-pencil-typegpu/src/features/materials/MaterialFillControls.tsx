import { For } from 'solid-js'
import {
  materialFillStyles,
  materialGradientTypes,
  type MaterialFillStyle,
  type MaterialGradientType,
} from '../../document'
import {
  materialFillStyleLabels,
  materialGradientTypeLabels,
  readMaterialFillStyle,
  readMaterialGradientType,
} from './materialOptions'

type MaterialFillControlsProps = {
  fillStyle: MaterialFillStyle
  gradientType: MaterialGradientType
  onSetFillStyle: (fillStyle: MaterialFillStyle) => void
  onSetGradientType: (gradientType: MaterialGradientType) => void
}

export function MaterialFillControls(props: MaterialFillControlsProps) {
  return (
    <div class="material-fill-row">
      <label class="select-control">
        Fill
        <select
          name="material-fill-style"
          value={props.fillStyle}
          onChange={(event) =>
            props.onSetFillStyle(readMaterialFillStyle(event.currentTarget.value))
          }
        >
          <For each={materialFillStyles}>
            {(fillStyle) => (
              <option value={fillStyle}>{materialFillStyleLabels[fillStyle]}</option>
            )}
          </For>
        </select>
      </label>

      <label class="select-control">
        Gradient
        <select
          name="material-gradient-type"
          value={props.gradientType}
          disabled={props.fillStyle !== 'gradient'}
          onChange={(event) =>
            props.onSetGradientType(
              readMaterialGradientType(event.currentTarget.value),
            )
          }
        >
          <For each={materialGradientTypes}>
            {(gradientType) => (
              <option value={gradientType}>
                {materialGradientTypeLabels[gradientType]}
              </option>
            )}
          </For>
        </select>
      </label>
    </div>
  )
}
