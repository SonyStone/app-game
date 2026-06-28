import { For } from 'solid-js'
import type { GreaseLayer, LayerId } from '../../document'

type LayerPanelProps = {
  activeLayerId: LayerId
  layersTopFirst: readonly GreaseLayer[]
  onAddLayer: () => void
  onSelectLayer: (layerId: LayerId) => void
  onMoveLayerTowardTop: (layerId: LayerId) => void
  onMoveLayerTowardBottom: (layerId: LayerId) => void
  onToggleVisibility: (layerId: LayerId) => void
  onToggleLock: (layerId: LayerId) => void
  onRemoveLayer: (layerId: LayerId) => void
  onSetLayerOpacity: (layerId: LayerId, opacity: number) => void
  canMoveLayerTowardTop: (layerId: LayerId) => boolean
  canMoveLayerTowardBottom: (layerId: LayerId) => boolean
  countVisibleStrokes: (layerId: LayerId) => number
}

export function LayerPanel(props: LayerPanelProps) {
  return (
    <>
      <div class="panel-header">
        <span>Layers</span>
        <button
          class="icon-button"
          type="button"
          title="Add layer"
          onClick={props.onAddLayer}
        >
          +
        </button>
      </div>

      <div class="layer-list">
        <For each={props.layersTopFirst}>
          {(layer) => (
            <div
              class={`layer-row ${
                layer.id === props.activeLayerId ? 'layer-row-active' : ''
              } ${layer.visible ? '' : 'layer-row-muted'}`}
            >
              <button
                class="layer-main"
                type="button"
                onClick={() => props.onSelectLayer(layer.id)}
              >
                <span class="layer-name">{layer.name}</span>
                <span class="layer-meta">
                  {props.countVisibleStrokes(layer.id)} strokes
                </span>
              </button>

              <div class="layer-actions">
                <button
                  class="icon-button"
                  type="button"
                  title="Move layer up"
                  disabled={!props.canMoveLayerTowardTop(layer.id)}
                  onClick={() => props.onMoveLayerTowardTop(layer.id)}
                >
                  ↑
                </button>
                <button
                  class="icon-button"
                  type="button"
                  title="Move layer down"
                  disabled={!props.canMoveLayerTowardBottom(layer.id)}
                  onClick={() => props.onMoveLayerTowardBottom(layer.id)}
                >
                  ↓
                </button>
                <button
                  class="icon-button"
                  type="button"
                  title={layer.visible ? 'Hide layer' : 'Show layer'}
                  onClick={() => props.onToggleVisibility(layer.id)}
                >
                  {layer.visible ? 'V' : 'H'}
                </button>
                <button
                  class="icon-button"
                  type="button"
                  title={layer.locked ? 'Unlock layer' : 'Lock layer'}
                  onClick={() => props.onToggleLock(layer.id)}
                >
                  {layer.locked ? 'L' : 'U'}
                </button>
                <button
                  class="icon-button"
                  type="button"
                  title="Remove layer"
                  onClick={() => props.onRemoveLayer(layer.id)}
                >
                  -
                </button>
              </div>

              <label class="layer-opacity">
                Opacity
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={layer.opacity}
                  onInput={(event) =>
                    props.onSetLayerOpacity(
                      layer.id,
                      event.currentTarget.valueAsNumber,
                    )
                  }
                />
              </label>
            </div>
          )}
        </For>
      </div>
    </>
  )
}
