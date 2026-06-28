import { For } from 'solid-js'
import type { Vec4 } from '../../shared/vector'
import {
  colorOptions,
  sameRgb,
  withAlpha,
} from '../shared/color'

type MaterialColorStripProps = {
  activeColor: Vec4
  alpha: number
  label: string
  onSelectColor: (color: Vec4) => void
}

export function MaterialColorStrip(props: MaterialColorStripProps) {
  return (
    <>
      <div class="control-group-label">{props.label}</div>
      <div class="fill-color-strip">
        <For each={colorOptions}>
          {(color) => (
            <button
              class={`color-swatch ${
                sameRgb(props.activeColor, color.value) ? 'color-swatch-active' : ''
              }`}
              style={{ 'background-color': color.swatch }}
              type="button"
              title={color.name}
              onClick={() => props.onSelectColor(withAlpha(color.value, props.alpha))}
            />
          )}
        </For>
      </div>
    </>
  )
}
