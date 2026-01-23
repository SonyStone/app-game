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

  /** Custom styles */
  style?: JSX.CSSProperties;
}

// Styles
const panelStyle: JSX.CSSProperties = {
  display: 'flex',
  'flex-direction': 'column',
  background: '#2a2a2a',
  border: '1px solid #444',
  'border-radius': '4px',
  'min-width': '200px',
  'max-height': '400px',
  overflow: 'hidden'
};

const headerStyle: JSX.CSSProperties = {
  display: 'flex',
  'justify-content': 'space-between',
  'align-items': 'center',
  padding: '8px 12px',
  background: '#333',
  'border-bottom': '1px solid #444'
};

const titleStyle: JSX.CSSProperties = {
  color: '#ccc',
  'font-size': '12px',
  'font-weight': 'bold'
};

const layerListStyle: JSX.CSSProperties = {
  flex: 1,
  'overflow-y': 'auto',
  padding: '4px'
};

const layerItemStyle = (isActive: boolean): JSX.CSSProperties => ({
  display: 'flex',
  'align-items': 'center',
  gap: '8px',
  padding: '6px 8px',
  background: isActive ? '#3a5a8a' : 'transparent',
  'border-radius': '4px',
  cursor: 'pointer',
  'margin-bottom': '2px'
});

const iconButtonStyle: JSX.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#888',
  cursor: 'pointer',
  padding: '4px',
  'font-size': '14px',
  'line-height': 1,
  'border-radius': '2px'
};

const addButtonStyle: JSX.CSSProperties = {
  background: '#444',
  border: 'none',
  color: '#ccc',
  cursor: 'pointer',
  padding: '4px 8px',
  'font-size': '12px',
  'border-radius': '4px'
};

const layerNameStyle: JSX.CSSProperties = {
  flex: 1,
  color: '#ccc',
  'font-size': '12px',
  overflow: 'hidden',
  'text-overflow': 'ellipsis',
  'white-space': 'nowrap'
};

const opacityInputStyle: JSX.CSSProperties = {
  width: '50px',
  background: '#333',
  border: '1px solid #555',
  color: '#ccc',
  'font-size': '11px',
  padding: '2px 4px',
  'border-radius': '2px'
};

const footerStyle: JSX.CSSProperties = {
  display: 'flex',
  gap: '4px',
  padding: '8px',
  'border-top': '1px solid #444',
  background: '#333'
};

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
    <div style={{ ...panelStyle, ...props.style }}>
      {/* Header */}
      <div style={headerStyle}>
        <span style={titleStyle}>{title()}</span>
        <button style={addButtonStyle} onClick={props.onAddLayer} title="Add Layer">
          + Add
        </button>
      </div>

      {/* Layer List */}
      <div style={layerListStyle}>
        <For each={displayLayers()}>
          {(layer) => {
            const isActive = () => props.activeLayerId() === layer.id;
            const isEditing = () => editingId() === layer.id;

            return (
              <div style={layerItemStyle(isActive())} onClick={() => props.onSelectLayer(layer.id)}>
                {/* Visibility Toggle */}
                <button
                  style={{
                    ...iconButtonStyle,
                    color: layer.visible ? '#8cf' : '#555'
                  }}
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
                    style={{
                      ...iconButtonStyle,
                      color: layer.locked ? '#fa5' : '#555'
                    }}
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
                      style={{
                        ...layerNameStyle,
                        background: '#333',
                        border: '1px solid #555',
                        padding: '2px 4px',
                        'border-radius': '2px'
                      }}
                      autofocus
                    />
                  }
                >
                  <span style={layerNameStyle} onDblClick={() => startEditing(layer)} title="Double-click to rename">
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
                    style={opacityInputStyle}
                    title="Opacity %"
                  />
                </Show>

                {/* Delete Button */}
                <button
                  style={{ ...iconButtonStyle, color: '#f55' }}
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
          <div
            style={{
              color: '#666',
              'font-size': '12px',
              'text-align': 'center',
              padding: '20px'
            }}
          >
            No layers. Click "Add" to create one.
          </div>
        </Show>
      </div>

      {/* Footer with move buttons */}
      <Show when={props.onMoveLayerUp || props.onMoveLayerDown}>
        <div style={footerStyle}>
          <Show when={props.onMoveLayerUp}>
            <button
              style={addButtonStyle}
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
              style={addButtonStyle}
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
