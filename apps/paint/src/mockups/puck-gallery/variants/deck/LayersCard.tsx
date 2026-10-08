import { For, Show } from 'solid-js';
import { SketchIcon } from '../../../../shared/ui/SketchIcon';
import { blendLabel, blendModes } from '../../kit/createSketchCanvas';
import type { Studio } from '../../kit/createStudio';
import { LayerThumb } from '../../kit/LayerThumb';
import type { NumberSetting } from '../../kit/values';
import { Kbd } from './cards';
import { pressable, ScrubChip, StepChip, TapButton } from './controls';
import styles from './Deck.module.css';

/**
 * The layers card: rows with a live thumbnail, the name, the blend and opacity, an eye and a lock; then the selected
 * layer's blend mode and opacity as scrub chips, and add, duplicate, delete, up, down. Picking a layer is a finished
 * action (`done`); the eye, the lock, the chips and the actions are not.
 */
export function LayersCard(props: { studio: Studio; done: () => void }) {
  const selected = () => props.studio.layers().find((layer) => layer.id === props.studio.activeLayer());
  const position = () => props.studio.layers().findIndex((layer) => layer.id === props.studio.activeLayer());

  return (
    <div class={styles.body}>
      <div class={styles.layerList}>
        {/* Keyed by id, so that a row keeps its thumbnail and its press while the layer changes or moves. */}
        <For each={props.studio.layers()} keyed={(layer) => layer.id}>
          {(layer) => {
            const press = pressable({
              tap() {
                props.studio.selectLayer(layer().id);
                props.done();
              }
            });
            return (
              <div
                class={[
                  styles.layerRow,
                  {
                    [styles.on!]: layer().id === props.studio.activeLayer(),
                    [styles.dim!]: !layer().visible
                  }
                ]}
                title={`${layer().name}: tap to select`}
                {...press}
              >
                <LayerThumb studio={props.studio} layer={layer().id} width={42} height={29} class={styles.layerThumb} />
                <span class={styles.layerText}>
                  <b>{layer().name}</b>
                  <small>
                    {blendLabel(layer().blend)} · {layer().opacity}%
                  </small>
                </span>
                <TapButton
                  class={styles.layerIcon}
                  title={layer().visible ? 'Hide' : 'Show'}
                  on={!layer().visible}
                  onTap={() => props.studio.updateLayer(layer().id, { visible: !layer().visible })}
                >
                  <SketchIcon name={layer().visible ? 'eye' : 'hidden'} size={17} />
                </TapButton>
                <TapButton
                  class={styles.layerIcon}
                  title={layer().locked ? 'Unlock' : 'Lock'}
                  on={layer().locked}
                  onTap={() => props.studio.updateLayer(layer().id, { locked: !layer().locked })}
                >
                  <SketchIcon name={layer().locked ? 'lock' : 'unlock'} size={17} />
                </TapButton>
              </div>
            );
          }}
        </For>
      </div>

      <Show when={selected()}>
        {(layer) => (
          <div class={styles.settingsGrid}>
            <StepChip
              label="Blend"
              options={blendModes}
              value={layer().blend}
              format={blendLabel}
              onChange={(blend) => props.studio.updateLayer(layer().id, { blend })}
            />
            <ScrubChip
              setting={opacity}
              value={layer().opacity}
              onChange={(value) => props.studio.updateLayer(layer().id, { opacity: Math.round(value) })}
            />
          </div>
        )}
      </Show>

      <div class={styles.layerActions}>
        <TapButton title="New layer (N)" onTap={() => props.studio.addLayer()}>
          <SketchIcon name="plus" size={17} />
          <Kbd>N</Kbd>
        </TapButton>
        <TapButton title="Duplicate" onTap={() => props.studio.duplicateLayer()}>
          <SketchIcon name="copy" size={17} />
        </TapButton>
        <TapButton title="Delete" disabled={props.studio.layers().length <= 1} onTap={() => props.studio.deleteLayer()}>
          <SketchIcon name="trash" size={17} />
        </TapButton>
        <TapButton title="Move up" disabled={position() <= 0} onTap={() => props.studio.moveLayer('up')}>
          <SketchIcon name="up" size={17} />
        </TapButton>
        <TapButton
          title="Move down"
          disabled={position() >= props.studio.layers().length - 1}
          onTap={() => props.studio.moveLayer('down')}
        >
          <SketchIcon name="down" size={17} />
        </TapButton>
      </div>
    </div>
  );
}

/** The selected layer's opacity, scrubbed like a tool setting. */
const opacity: NumberSetting = {
  kind: 'number',
  key: 'opacity',
  label: 'Opacity',
  short: 'Op',
  min: 0,
  max: 100,
  unit: '%',
  presets: [0, 10, 20, 25, 30, 40, 50, 60, 65, 70, 75, 80, 90, 100]
};
