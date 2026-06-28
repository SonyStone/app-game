import { For } from 'solid-js'
import type { Vec4 } from '../../shared/vector'
import { colorOptions, sameVec4 } from '../shared/color'

type StrokeColorStripProps = {
  activeStrokeColor: Vec4
  onSetStrokeColor: (strokeColor: Vec4) => void
}

export function StrokeColorStrip(props: StrokeColorStripProps) {
  return (
    <div class="color-strip">
      <For each={colorOptions}>
        {(color) => (
          <button
            class={`color-swatch ${
              sameVec4(props.activeStrokeColor, color.value)
                ? 'color-swatch-active'
                : ''
            }`}
            style={{ 'background-color': color.swatch }}
            type="button"
            title={color.name}
            onClick={() => props.onSetStrokeColor(color.value)}
          />
        )}
      </For>
    </div>
  )
}
