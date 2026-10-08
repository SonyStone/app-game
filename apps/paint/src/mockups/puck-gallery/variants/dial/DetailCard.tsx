import { For, Match, Show, Switch } from 'solid-js';
import { presets, type Setting } from '../../kit/catalog';
import { blendLabel, type Point } from '../../kit/createSketchCanvas';
import type { Studio } from '../../kit/createStudio';
import { LayerThumb } from '../../kit/LayerThumb';
import { pressHandlers, type Press } from '../../kit/pressHandlers';
import { StrokePreview } from '../../kit/StrokePreview';
import { formatValue, fractionOf } from '../../kit/values';
import { galleryUi } from '../../kit/variant';
import type { Channel, DialModel, LayerPart } from './createDialModel';
import styles from './Dial.module.css';
import { clamp } from './geometry';
import { Glyph } from './Glyph';
import { makeWheelSteps, tapHandlers } from './input';

/**
 * The card beside the dial: the details of the current mode, and the place to choose what the dial turns. Settings
 * modes list the tool's settings (a tap makes a row the dial's target, toggles flip), Color holds a compact picker
 * and the channel the dial turns, Brush the presets with sample strokes, Layer the layer list with blend and opacity
 * as dial targets, Zoom and Rotate their stops. History needs no card: the dial is its scrubber.
 *
 * Picking a preset or a layer row is a finished action and reports `onDone`; everything else keeps the card open.
 */
export function DetailCard(props: {
  studio: Studio;
  model: DialModel;
  /** The dial's center, the pivot for zoom and rotation stops. */
  center: Point;
  /** The card's top-left corner in client pixels. */
  corner: Point;
  width: number;
  onDone: () => void;
}) {
  const mode = () => props.model.mode();

  return (
    <Show when={mode() !== 'history'}>
      <section
        {...galleryUi}
        class={styles.card}
        style={{ left: `${props.corner.x}px`, top: `${props.corner.y}px`, width: `${props.width}px` }}
        onWheel={(event) => event.preventDefault()}
      >
        <Switch>
          <Match when={mode() === 'color'}>
            <ColorFace studio={props.studio} model={props.model} center={props.center} />
          </Match>
          <Match when={mode() === 'brush'}>
            <BrushFace studio={props.studio} onDone={props.onDone} />
          </Match>
          <Match when={mode() === 'layer'}>
            <LayerFace studio={props.studio} model={props.model} center={props.center} onDone={props.onDone} />
          </Match>
          <Match when={mode() === 'zoom' || mode() === 'rotate'}>
            <ViewFace studio={props.studio} center={props.center} />
          </Match>
          <Match when={true}>
            <SettingsFace studio={props.studio} model={props.model} center={props.center} />
          </Match>
        </Switch>
      </section>
    </Show>
  );
}

/** The current tool's settings; the row the dial turns is lit. */
function SettingsFace(props: { studio: Studio; model: DialModel; center: Point }) {
  const preset = () => presets.find((entry) => entry.id === props.studio.preset());
  const targeted = (setting: Setting) => {
    const mode = props.model.mode();
    return (
      (mode === 'size' || mode === 'opacity' ? mode : mode === 'tune' ? props.model.tuneKey() : undefined) ===
      setting.key
    );
  };

  return (
    <>
      <header class={styles.cardHeader}>
        <Glyph name={props.studio.toolInfo().icon} size={15} />
        <b>{props.studio.toolInfo().label}</b>
        <Show when={preset()?.tool === props.studio.tool() ? preset() : undefined}>
          {(shown) => <span>{shown().name}</span>}
        </Show>
      </header>
      <For each={props.studio.settings()}>
        {(setting) => {
          const wheel = makeWheelSteps();
          const value = () => props.studio.value(setting.key);
          return (
            <button
              {...galleryUi}
              {...tapHandlers(() => {
                if (setting.kind === 'toggle') {
                  props.studio.setValue(setting.key, value() !== true);
                } else {
                  props.model.target(setting.key);
                }
              })}
              class={[styles.row, { [styles.lit!]: targeted(setting) }]}
              title={setting.kind === 'toggle' ? 'Tap: switch' : 'Tap: turn it with the dial · wheel: adjust'}
              onWheel={(event) => {
                if (setting.kind === 'toggle') {
                  return;
                }

                event.preventDefault();
                props.model.target(setting.key);
                props.model.step(wheel(event), props.center);
              }}
            >
              <small>{setting.short}</small>
              <span class={styles.rowLabel}>{setting.label}</span>
              <Show
                when={setting.kind === 'toggle'}
                fallback={
                  <span class={styles.rowValue}>
                    {setting.kind === 'number' ? formatValue(Number(value() ?? 0)) : String(value() ?? '')}
                    <small>{setting.kind === 'number' ? setting.unit : ''}</small>
                  </span>
                }
              >
                <span class={[styles.switch, { [styles.on!]: value() === true }]}>
                  <i />
                </span>
              </Show>
              <Show when={setting.kind === 'number' ? setting : undefined}>
                {(number) => (
                  <span class={styles.rowLevel}>
                    <i style={{ width: `${fractionOf(number(), Number(value() ?? 0)) * 100}%` }} />
                  </span>
                )}
              </Show>
            </button>
          );
        }}
      </For>
    </>
  );
}

/**
 * A compact HSV picker: a saturation–value field and a hue strip to drag, and the three channels as dial targets
 * (tap one, then turn; the wheel over one adjusts it).
 */
function ColorFace(props: { studio: Studio; model: DialModel; center: Point }) {
  const hsv = () => props.model.hsv();
  const field = dragArea(
    (x, y) => props.model.setHsv({ ...hsv(), s: x, v: 1 - y }),
    () => props.studio.commitColor()
  );
  const hue = dragArea(
    (x) => props.model.setHsv({ ...hsv(), h: Math.min(359.9, x * 360) }),
    () => props.studio.commitColor()
  );
  const channels: readonly { id: Channel; label: string; text: () => string }[] = [
    { id: 'h', label: 'H', text: () => `${Math.round(hsv().h)}°` },
    { id: 's', label: 'S', text: () => `${Math.round(hsv().s * 100)}` },
    { id: 'v', label: 'V', text: () => `${Math.round(hsv().v * 100)}` }
  ];

  return (
    <>
      <header class={styles.cardHeader}>
        <Glyph name="drop" size={15} />
        <b>Color</b>
        <span class={styles.mono}>{props.studio.color()}</span>
      </header>
      <div
        {...galleryUi}
        {...field}
        class={styles.field}
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${props.studio.hsvToHex({ h: hsv().h, s: 1, v: 1 })})`
        }}
      >
        <i style={{ left: `${hsv().s * 100}%`, top: `${(1 - hsv().v) * 100}%`, background: props.studio.color() }} />
      </div>
      <div {...galleryUi} {...hue} class={styles.hueStrip}>
        <i style={{ left: `${(hsv().h / 360) * 100}%` }} />
      </div>
      <div class={styles.segmented}>
        <For each={channels}>
          {(channel) => {
            const wheel = makeWheelSteps();
            return (
              <button
                {...galleryUi}
                {...tapHandlers(() => props.model.setChannel(channel.id))}
                class={{ [styles.lit!]: props.model.channel() === channel.id }}
                title="Tap: turn it with the dial · wheel: adjust"
                onWheel={(event) => {
                  event.preventDefault();
                  props.model.setChannel(channel.id);
                  props.model.step(wheel(event), props.center);
                }}
              >
                <small>{channel.label}</small>
                {channel.text()}
              </button>
            );
          }}
        </For>
      </div>
    </>
  );
}

/** Brush presets as sample strokes; a tap applies one and is done. */
function BrushFace(props: { studio: Studio; onDone: () => void }) {
  return (
    <>
      <header class={styles.cardHeader}>
        <Glyph name="brush" size={15} />
        <b>Brushes</b>
        <span>{presets.find((entry) => entry.id === props.studio.preset())?.set ?? ''}</span>
      </header>
      <div class={styles.presets}>
        <For each={presets}>
          {(preset) => (
            <button
              {...galleryUi}
              {...tapHandlers(() => {
                props.studio.choosePreset(preset.id);
                props.onDone();
              })}
              class={[styles.preset, { [styles.lit!]: props.studio.preset() === preset.id }]}
              title={`${preset.name} · ${preset.set}`}
            >
              <span>{preset.name}</span>
              <StrokePreview preset={preset} color={props.studio.color()} height={22} />
            </button>
          )}
        </For>
      </div>
    </>
  );
}

/**
 * The layer list, top first: the eye toggles visibility, a tap on the row picks the layer (done). The header adds,
 * duplicates, deletes and moves the active layer; the footer chooses what the dial turns: the pick, opacity or blend.
 */
function LayerFace(props: { studio: Studio; model: DialModel; center: Point; onDone: () => void }) {
  const active = () => props.studio.layers().find((entry) => entry.id === props.studio.activeLayer());
  const actions = [
    { icon: 'newLayer', title: 'Add a layer', run: () => props.studio.addLayer() },
    { icon: 'copy', title: 'Duplicate the layer', run: () => props.studio.duplicateLayer() },
    { icon: 'trash', title: 'Delete the layer', run: () => props.studio.deleteLayer() },
    { icon: 'up', title: 'Move up', run: () => props.studio.moveLayer('up') },
    { icon: 'down', title: 'Move down', run: () => props.studio.moveLayer('down') }
  ] as const;
  const parts: readonly { id: LayerPart; label: string; text: () => string }[] = [
    { id: 'pick', label: '', text: () => 'Pick' },
    { id: 'opacity', label: 'Op', text: () => `${active()?.opacity ?? 0}%` },
    { id: 'blend', label: 'Bl', text: () => (active() ? blendLabel(active()!.blend) : '') }
  ];

  return (
    <>
      <header class={styles.cardHeader}>
        <Glyph name="layers" size={15} />
        <b>Layers</b>
        <span class={styles.actions}>
          <For each={actions}>
            {(action) => (
              <button
                {...galleryUi}
                {...tapHandlers(() => action.run())}
                class={styles.iconButton}
                title={action.title}
              >
                <Glyph name={action.icon} size={15} />
              </button>
            )}
          </For>
        </span>
      </header>
      <For each={props.studio.layers()} keyed={(layer) => layer.id}>
        {(layer) => (
          <div class={[styles.layerRow, { [styles.lit!]: layer().id === props.studio.activeLayer() }]}>
            <button
              {...galleryUi}
              {...tapHandlers(() => props.studio.updateLayer(layer().id, { visible: !layer().visible }))}
              class={[styles.iconButton, { [styles.off!]: !layer().visible }]}
              title={layer().visible ? 'Hide' : 'Show'}
            >
              <Glyph name={layer().visible ? 'eye' : 'hidden'} size={15} />
            </button>
            <button
              {...galleryUi}
              {...tapHandlers(() => {
                props.studio.selectLayer(layer().id);
                props.onDone();
              })}
              class={styles.layerPick}
              title="Pick this layer"
            >
              <LayerThumb studio={props.studio} layer={layer().id} width={36} height={25} />
              <span>
                <b>{layer().name}</b>
                <small>
                  {blendLabel(layer().blend)} · {layer().opacity}%{layer().locked ? ' · locked' : ''}
                </small>
              </span>
            </button>
          </div>
        )}
      </For>
      <div class={styles.segmented}>
        <For each={parts}>
          {(part) => {
            const wheel = makeWheelSteps();
            return (
              <button
                {...galleryUi}
                {...tapHandlers(() => props.model.setLayerPart(part.id))}
                class={{ [styles.lit!]: props.model.layerPart() === part.id }}
                title="Tap: turn it with the dial · wheel: adjust"
                onWheel={(event) => {
                  event.preventDefault();
                  props.model.setLayerPart(part.id);
                  props.model.step(wheel(event), props.center);
                }}
              >
                <small>{part.label}</small>
                {part.text()}
              </button>
            );
          }}
        </For>
      </div>
    </>
  );
}

/** Zoom and rotation stops and the flip, for jumps the dial would take several turns for. */
function ViewFace(props: { studio: Studio; center: Point }) {
  const zooms = [0.25, 0.5, 1, 2, 4];
  const angles = [-90, -45, 0, 45, 90];

  return (
    <>
      <header class={styles.cardHeader}>
        <Glyph name="zoom" size={15} />
        <b>View</b>
        <span class={styles.mono}>
          {Math.round(props.studio.view().scale * 100)}% · {Math.round(props.studio.view().angle)}°
        </span>
      </header>
      <div class={styles.stops}>
        <button {...galleryUi} {...tapHandlers(() => props.studio.fit())} title="Fit the drawing">
          Fit
        </button>
        <For each={zooms}>
          {(zoom) => (
            <button
              {...galleryUi}
              {...tapHandlers(() => props.studio.zoomTo(zoom, props.center))}
              class={{ [styles.lit!]: Math.abs(props.studio.view().scale - zoom) < 0.005 }}
            >
              {zoom * 100}
            </button>
          )}
        </For>
      </div>
      <div class={styles.stops}>
        <For each={angles}>
          {(angle) => (
            <button
              {...galleryUi}
              {...tapHandlers(() => props.studio.rotateTo(angle))}
              class={{ [styles.lit!]: Math.abs(props.studio.view().angle - angle) < 0.5 }}
            >
              {angle}°
            </button>
          )}
        </For>
        <button
          {...galleryUi}
          {...tapHandlers(() => props.studio.flip())}
          class={{ [styles.lit!]: props.studio.view().flipped }}
          title="Flip the view"
        >
          <Glyph name="mirror" size={15} />
        </button>
      </div>
    </>
  );
}

/**
 * Press-drag handlers for a 2D picker area: `change` gets the press's position as fractions 0–1 of the element,
 * from the press on; `settle` runs on the lift.
 */
function dragArea(change: (x: number, y: number) => void, settle: () => void) {
  const at = (press: Press) => {
    const box = press.target.getBoundingClientRect();
    change(clamp((press.point.x - box.left) / box.width, 0, 1), clamp((press.point.y - box.top) / box.height, 0, 1));
  };

  return pressHandlers({
    start: (press) => at(press),
    move: (press) => at(press),
    end: () => settle(),
    cancel: () => settle()
  });
}
