import { For } from 'solid-js';
import { SketchIcon, type SketchIconName } from '../../../../shared/ui/SketchIcon';
import { blendLabel, blendModes, type BlendMode } from '../../kit/createSketchCanvas';
import type { Studio } from '../../kit/createStudio';
import { LayerThumb } from '../../kit/LayerThumb';
import { pressHandlers } from '../../kit/pressHandlers';
import { galleryUi } from '../../kit/variant';
import styles from './pie.module.css';
import { ChoiceField, ValueField } from './widgets';

/**
 * Layers as Blender's popover panel with a UI list: the active layer's blend mode and opacity on top, then the list
 * (eye, thumbnail, name, lock; a tap on a row makes it active), and the list's side buttons to add, remove, copy and
 * move. Opens at `at`, kept inside the window; it stays open while you work in it.
 */
export function LayersPanel(props: { studio: Studio; at: { x: number; y: number }; touch: boolean }) {
  const studio = () => props.studio;
  const active = () =>
    studio()
      .layers()
      .find((layer) => layer.id === studio().activeLayer());
  const width = 300;
  const rowHeight = () => (props.touch ? 34 : 28);
  const height = () => 74 + studio().layers().length * (rowHeight() + 1) + 12;
  const left = () => Math.min(Math.max(8, props.at.x - width / 2), innerWidth - width - 8);
  const top = () => Math.min(Math.max(52, props.at.y - 40), innerHeight - height() - 8);

  return (
    <div
      class={styles.panel}
      data-touch={props.touch || undefined}
      data-pie-widget
      {...galleryUi}
      style={{ left: `${left()}px`, top: `${top()}px`, width: `${width}px` }}
    >
      <div class={styles.panelHeader}>Layers</div>
      <div class={styles.panelRow}>
        <ChoiceField
          label="Blend"
          options={blendModes}
          value={active()?.blend ?? 'normal'}
          format={(mode) => blendLabel(mode as BlendMode)}
          onChange={(mode) => studio().updateLayer(studio().activeLayer(), { blend: mode as BlendMode })}
        />
      </div>
      <div class={styles.panelRow}>
        <ValueField
          setting={opacity}
          value={active()?.opacity ?? 100}
          onChange={(value) => studio().updateLayer(studio().activeLayer(), { opacity: value })}
        />
      </div>
      <div class={styles.listBox}>
        <div class={styles.list}>
          {/* Keyed by id, so that a row keeps its thumbnail canvas while the layer's settings change. */}
          <For each={studio().layers()} keyed={(layer) => layer.id}>
            {(layer) => (
              <div
                class={[styles.listRow, { [styles.activeRow!]: layer().id === studio().activeLayer() }]}
                style={{ height: `${rowHeight()}px` }}
                {...pressHandlers({ tap: () => studio().selectLayer(layer().id), end: () => undefined })}
              >
                <button
                  class={styles.iconButton}
                  title={layer().visible ? 'Hide' : 'Show'}
                  {...pressHandlers({
                    start: (_press, event) => {
                      event.stopPropagation();
                    },
                    tap: () => studio().updateLayer(layer().id, { visible: !layer().visible }),
                    end: () => undefined
                  })}
                >
                  <SketchIcon name={layer().visible ? 'eye' : 'hidden'} size={15} />
                </button>
                <LayerThumb studio={studio()} layer={layer().id} width={34} height={23} class={styles.thumb} />
                <span class={styles.layerName}>{layer().name}</span>
                <small class={styles.layerMeta}>
                  {layer().blend === 'normal' ? '' : blendLabel(layer().blend)}
                  {layer().opacity < 100 ? ` ${layer().opacity}%` : ''}
                </small>
                <button
                  class={styles.iconButton}
                  title={layer().locked ? 'Unlock' : 'Lock'}
                  {...pressHandlers({
                    start: (_press, event) => {
                      event.stopPropagation();
                    },
                    tap: () => studio().updateLayer(layer().id, { locked: !layer().locked }),
                    end: () => undefined
                  })}
                >
                  <SketchIcon name={layer().locked ? 'lock' : 'unlock'} size={14} />
                </button>
              </div>
            )}
          </For>
        </div>
        <div class={styles.sideButtons}>
          <SideButton icon="plus" title="New layer" onTap={() => studio().addLayer()} />
          <SideButton icon="minus" title="Delete layer" onTap={() => studio().deleteLayer()} />
          <span class={styles.sideGap} />
          <SideButton icon="copy" title="Duplicate layer" onTap={() => studio().duplicateLayer()} />
          <span class={styles.sideGap} />
          <SideButton icon="up" title="Move up" onTap={() => studio().moveLayer('up')} />
          <SideButton icon="down" title="Move down" onTap={() => studio().moveLayer('down')} />
        </div>
      </div>
    </div>
  );
}

const opacity = {
  kind: 'number',
  key: 'opacity',
  label: 'Opacity',
  short: 'Op',
  min: 0,
  max: 100,
  unit: '%',
  presets: [0, 10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 100]
} as const;

function SideButton(props: { icon: SketchIconName; title: string; onTap: () => void }) {
  return (
    <button
      class={styles.sideButton}
      title={props.title}
      {...pressHandlers({ tap: () => props.onTap(), end: () => undefined })}
    >
      <SketchIcon name={props.icon} size={15} />
    </button>
  );
}
