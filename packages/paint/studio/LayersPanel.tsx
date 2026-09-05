import { For } from 'solid-js';
import type { PaintSession } from './createPaintSession';
import type { BlendMode } from './document';
import { SketchIcon } from './SketchIcon';

/** Edits layer order and compositing properties through undoable document commands. */
export function LayersPanel(props: Pick<PaintSession, 'state' | 'ready' | 'layer'>) {
  const { state, ready, layer } = props;
  const selected = () => state().layers.find((item) => item.id === state().activeId)!;
  return (
    <section class="paint-layers">
      <div class="paint-section-heading">
        <span>{state().layers.length} layers</span>
        <button aria-label="Add layer" disabled={!ready()} onClick={() => layer({ type: 'add' })}>
          <SketchIcon name="plus" size={18} />
        </button>
      </div>
      <div class="paint-layer-controls">
        <select
          aria-label="Layer blend mode"
          value={selected().blend}
          onChange={(e) =>
            layer({ type: 'update', id: state().activeId, patch: { blend: e.currentTarget.value as BlendMode } })
          }
        >
          <option value="linear">Smooth color</option>
          <option value="normal">Normal (classic)</option>
          <option value="multiply">Multiply</option>
          <option value="screen">Screen</option>
          <option value="overlay">Overlay</option>
        </select>
        <input
          aria-label="Layer opacity"
          title="Layer opacity"
          type="number"
          min="0"
          max="100"
          value={Math.round(selected().opacity * 100)}
          onChange={(e) =>
            layer({
              type: 'update',
              id: state().activeId,
              patch: { opacity: Math.max(0, Math.min(100, Number(e.currentTarget.value))) / 100 }
            })
          }
        />
        <span>%</span>
      </div>
      <p class="paint-blend-note">
        {selected().blend === 'multiply'
          ? 'Multiply darkens overlaps. Choose Smooth color for brighter color transitions.'
          : selected().blend === 'linear'
            ? 'Blends colors in linear light.'
            : 'Standard layer blend mode.'}
      </p>
      <div class="paint-layer-list">
        <For each={[...state().layers].reverse()}>
          {(item) => (
            <div class={['paint-layer', { selected: item.id === state().activeId }]}>
              <button
                class="paint-layer-eye"
                aria-label={`${item.visible ? 'Hide' : 'Show'} ${item.name}`}
                onClick={() => layer({ type: 'update', id: item.id, patch: { visible: !item.visible } })}
              >
                <SketchIcon name={item.visible ? 'eye' : 'hidden'} size={18} />
              </button>
              <button
                class="paint-layer-select"
                aria-label={`Select ${item.name}`}
                onClick={() => layer({ type: 'select', id: item.id })}
              >
                <SketchIcon name="paper" size={26} />
                <span>
                  {item.name}
                  <small>Raster layer</small>
                </span>
              </button>
            </div>
          )}
        </For>
      </div>
      <div class="paint-layer-actions">
        <button
          aria-label="Move layer up"
          title="Move layer up"
          onClick={() => layer({ type: 'move', id: state().activeId, direction: 1 })}
        >
          <SketchIcon name="up" size={18} />
        </button>
        <button
          aria-label="Move layer down"
          title="Move layer down"
          onClick={() => layer({ type: 'move', id: state().activeId, direction: -1 })}
        >
          <SketchIcon name="down" size={18} />
        </button>
        <button
          aria-label="Delete layer"
          title="Delete selected layer"
          disabled={state().layers.length <= 1}
          onClick={() => layer({ type: 'delete', id: state().activeId })}
        >
          Delete
        </button>
      </div>
    </section>
  );
}
