import { For } from 'solid-js'
import type {
  GreaseMaterial,
  MaterialId,
} from '../../document'
import { vec4ToCss } from '../shared/color'

type MaterialListProps = {
  activeMaterialId: MaterialId
  materials: readonly GreaseMaterial[]
  onSelectMaterial: (materialId: MaterialId) => void
}

export function MaterialList(props: MaterialListProps) {
  return (
    <div class="material-list">
      <For each={props.materials}>
        {(material) => (
          <button
            class={`material-chip ${
              material.id === props.activeMaterialId ? 'material-chip-active' : ''
            }`}
            type="button"
            onClick={() => props.onSelectMaterial(material.id)}
          >
            <span
              class="material-swatch"
              style={{ 'background-color': vec4ToCss(material.strokeColor) }}
            />
            <span class="material-name">{material.name}</span>
          </button>
        )}
      </For>
    </div>
  )
}
