/**
 * LayerPanel - Layer management UI component
 *
 * Provides:
 * - Layer list with thumbnails (optional)
 * - Layer visibility toggle
 * - Layer opacity control
 * - Layer selection
 * - Add/delete layer buttons
 * - Reorder layers (drag or buttons)
 */

import { createSignal, For, Show, type Accessor, type JSX } from 'solid-js';

/** Layer data for UI display */
export interface LayerItem {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  locked: boolean;
  blendMode: string;
}

export interface LayerPanelProps {
  /** List of layers (bottom to top order) */
  layers: Accessor<LayerItem[]>;

  /** Currently active layer ID */
  activeLayerId: Accessor<string | null>;

  /** Layer selection handler */
  onSelectLayer: (id: string) => void;

  /** Toggle layer visibility */
  onToggleVisibility: (id: string) => void;

  /** Change layer opacity */
  onChangeOpacity: (id: string, opacity: number) => void;

  /** Rename layer */
  onRenameLayer?: (id: string, name: string) => void;

  /** Add new layer */
  onAddLayer: () => void;

  /** Delete layer */
  onDeleteLayer: (id: string) => void;

  /** Move layer up in stack */
  onMoveLayerUp?: (id: string) => void;

  /** Move layer down in stack */
  onMoveLayerDown?: (id: string) => void;

  /** Toggle layer lock */
  onToggleLock?: (id: string) => void;

  /** Panel title */
  title?: string;

  /** Show opacity slider */
  showOpacity?: boolean;

  /** Show blend mode */
  showBlendMode?: boolean;

  /** Custom class name */
  class?: string;
}

export function LayerPanel(props: LayerPanelProps): JSX.Element {
  const title = () => props.title ?? 'Layers';
  const showOpacity = () => props.showOpacity ?? true;

  // Editing state
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [editingName, setEditingName] = createSignal('');

  const startEditing = (layer: LayerItem) => {
    if (props.onRenameLayer) {
      setEditingId(layer.id);
      setEditingName(layer.name);
    }
  };

  const finishEditing = () => {
    const id = editingId();
    if (id && props.onRenameLayer) {
      props.onRenameLayer(id, editingName());
    }
    setEditingId(null);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      finishEditing();
    } else if (e.key === 'Escape') {
      setEditingId(null);
    }
  };

  // Reversed layers for display (top layer first)
  const displayLayers = () => [...props.layers()].reverse();

  return (
    <div
      class={`min-w-50 max-h-100 flex flex-col overflow-hidden rounded border border-neutral-700 bg-neutral-800 ${props.class ?? ''}`}
    >
      {/* Header */}
      <div class="flex items-center justify-between border-b border-neutral-600 bg-neutral-700 px-3 py-2">
        <span class="text-xs font-bold text-neutral-400">{title()}</span>
        <button
          class="cursor-pointer rounded border-none bg-neutral-600 px-2 py-1 text-xs text-neutral-400"
          onClick={props.onAddLayer}
          title="Add Layer"
        >
          + Add
        </button>
      </div>

      {/* Layer List */}
      <div class="flex-1 overflow-y-auto p-1">
        <For each={displayLayers()}>
          {(layer) => {
            const isActive = () => props.activeLayerId() === layer.id;
            const isEditing = () => editingId() === layer.id;

            return (
              <div
                class={`mb-0.5 flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 ${isActive() ? 'bg-blue-800/60' : 'bg-transparent hover:bg-neutral-700/50'}`}
                onClick={() => props.onSelectLayer(layer.id)}
              >
                {/* Visibility Toggle */}
                <button
                  class={`cursor-pointer rounded border-none bg-transparent p-1 text-sm leading-none ${layer.visible ? 'text-sky-300' : 'text-neutral-600'}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onToggleVisibility(layer.id);
                  }}
                  title={layer.visible ? 'Hide' : 'Show'}
                >
                  {layer.visible ? '👁' : '○'}
                </button>

                {/* Lock Toggle */}
                <Show when={props.onToggleLock}>
                  <button
                    class={`cursor-pointer rounded border-none bg-transparent p-1 text-sm leading-none ${layer.locked ? 'text-amber-400' : 'text-neutral-600'}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onToggleLock?.(layer.id);
                    }}
                    title={layer.locked ? 'Unlock' : 'Lock'}
                  >
                    {layer.locked ? '🔒' : '○'}
                  </button>
                </Show>

                {/* Layer Name */}
                <Show
                  when={!isEditing()}
                  fallback={
                    <input
                      type="text"
                      value={editingName()}
                      onInput={(e) => setEditingName(e.currentTarget.value)}
                      onBlur={finishEditing}
                      onKeyDown={handleKeyDown}
                      class="flex-1 overflow-hidden text-ellipsis whitespace-nowrap rounded border border-neutral-600 bg-neutral-700 px-1 py-0.5 text-xs text-neutral-400"
                      autofocus
                    />
                  }
                >
                  <span
                    class="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-neutral-400"
                    onDblClick={() => startEditing(layer)}
                    title="Double-click to rename"
                  >
                    {layer.name}
                  </span>
                </Show>

                {/* Opacity */}
                <Show when={showOpacity()}>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={Math.round(layer.opacity * 100)}
                    onInput={(e) => {
                      e.stopPropagation();
                      const val = parseInt(e.currentTarget.value) / 100;
                      props.onChangeOpacity(layer.id, Math.max(0, Math.min(1, val)));
                    }}
                    onClick={(e) => e.stopPropagation()}
                    class="w-12.5 rounded border border-neutral-600 bg-neutral-700 px-1 py-0.5 text-right text-[11px] text-neutral-400"
                    title="Opacity %"
                  />
                </Show>

                {/* Delete Button */}
                <button
                  class="cursor-pointer rounded border-none bg-transparent p-1 text-sm leading-none text-red-400"
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onDeleteLayer(layer.id);
                  }}
                  title="Delete Layer"
                >
                  ✕
                </button>
              </div>
            );
          }}
        </For>

        {/* Empty state */}
        <Show when={props.layers().length === 0}>
          <div class="p-5 text-center text-xs text-neutral-500">No layers. Click "Add" to create one.</div>
        </Show>
      </div>

      {/* Footer with move buttons */}
      <Show when={props.onMoveLayerUp || props.onMoveLayerDown}>
        <div class="flex gap-1 border-t border-neutral-700 bg-neutral-700 p-2">
          <Show when={props.onMoveLayerUp}>
            <button
              class="cursor-pointer rounded border-none bg-neutral-600 px-2 py-1 text-xs text-neutral-400 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => {
                const id = props.activeLayerId();
                if (id) props.onMoveLayerUp?.(id);
              }}
              disabled={!props.activeLayerId()}
              title="Move Layer Up"
            >
              ↑
            </button>
          </Show>
          <Show when={props.onMoveLayerDown}>
            <button
              class="cursor-pointer rounded border-none bg-neutral-600 px-2 py-1 text-xs text-neutral-400 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => {
                const id = props.activeLayerId();
                if (id) props.onMoveLayerDown?.(id);
              }}
              disabled={!props.activeLayerId()}
              title="Move Layer Down"
            >
              ↓
            </button>
          </Show>
        </div>
      </Show>
    </div>
  );
}

export default LayerPanel;
