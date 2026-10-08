import { createSignal, For, Show } from 'solid-js';
import { SketchIcon, type SketchIconName } from '../../../../shared/ui/SketchIcon';
import { blendLabel, blendModes } from '../../kit/createSketchCanvas';
import type { Studio } from '../../kit/createStudio';
import { LayerThumb } from '../../kit/LayerThumb';
import { pressHandlers } from '../../kit/pressHandlers';
import { galleryUi } from '../../kit/variant';
import { crescent, crescentEdge, crescentHeight, crescentReach } from './geometry';
import styles from './Orbit.module.css';
import { tappable, tapPress } from './tapPress';

/**
 * The layers as a crescent moon beside the settings rings on the non-hand side: its inner edge follows the rings,
 * and every line (header, layers, opacity, blend) slides along that curve. Tap a layer to make it active (a finished
 * action); the eye and the lock toggle in place; the header adds, duplicates, deletes and reorders the active layer.
 * The active layer's opacity is a slider band (drag or wheel) and its blend mode unfolds into a grid of modes in
 * place of the layer list.
 */
export function LayerCrescent(props: { studio: Studio; side: 1 | -1; done: () => void }) {
  const [blending, setBlending] = createSignal(false);
  const active = () => props.studio.layers().find((layer) => layer.id === props.studio.activeLayer());
  const activeIndex = () => props.studio.layers().findIndex((layer) => layer.id === props.studio.activeLayer());
  /** The lines between the header and the opacity band: the layers, or the blend modes three to a line. */
  const middleLines = () => (blending() ? blendLines.length : props.studio.layers().length);
  const lines = () => middleLines() + 3;
  const height = () => crescentHeight(lines());
  /** The line's place: its top, and its left edge clear of the curve over the line's whole height. */
  const place = (line: number) => {
    const top = -height() / 2 + crescent.padding + line * crescent.pitch;
    const nearest = top <= 0 && top + crescent.line >= 0 ? 0 : Math.min(Math.abs(top), Math.abs(top + crescent.line));
    const inner = crescentEdge(nearest) + crescent.padding;
    const left = props.side > 0 ? inner : -inner - crescent.lineWidth;
    return { left: `${left}px`, top: `${top}px` };
  };
  // Press handlers keep their press in a closure: create them once, never inside a JSX expression.
  const addPress = tapPress(() => props.studio.addLayer());
  const duplicatePress = tapPress(() => props.studio.duplicateLayer());
  const deletePress = tapPress(() => props.studio.deleteLayer());
  const upPress = tapPress(() => props.studio.moveLayer('up'));
  const downPress = tapPress(() => props.studio.moveLayer('down'));
  const blendPress = tapPress(() => setBlending((open) => !open));
  const opacityPress = pressHandlers({
    start: (press, event) => setOpacity(event, press.target),
    move: (press, event) => setOpacity(event, press.target)
  });

  return (
    <div class={styles.crescent} data-part="ui">
      <svg
        class={styles.crescentShape}
        viewBox={`0 ${-height() / 2} ${crescentReach} ${height()}`}
        style={{
          left: props.side > 0 ? '0px' : `${-crescentReach}px`,
          top: `${-height() / 2}px`,
          width: `${crescentReach}px`,
          height: `${height()}px`
        }}
      >
        <path
          {...galleryUi}
          d={crescentPath(height())}
          transform={props.side > 0 ? undefined : `translate(${crescentReach} 0) scale(-1 1)`}
        />
      </svg>

      <div class={[styles.line, styles.header]} style={place(0)}>
        <span class={styles.headerTitle}>Layers</span>
        <LayerButton icon="plus" label="Add a layer" press={addPress} />
        <LayerButton icon="copy" label="Duplicate the layer" press={duplicatePress} />
        <LayerButton
          icon="trash"
          label="Delete the layer"
          disabled={props.studio.layers().length <= 1}
          press={deletePress}
        />
        <LayerButton icon="up" label="Move the layer up" disabled={activeIndex() <= 0} press={upPress} />
        <LayerButton
          icon="down"
          label="Move the layer down"
          disabled={activeIndex() >= props.studio.layers().length - 1}
          press={downPress}
        />
      </div>

      <Show
        when={blending()}
        fallback={
          <For each={props.studio.layers()} keyed={(layer) => layer.id}>
            {(layer, index) => {
              const visibilityPress = tapPress(() =>
                props.studio.updateLayer(layer().id, { visible: !layer().visible })
              );
              const pickPress = tapPress(() => {
                props.studio.selectLayer(layer().id);
                props.done();
              });
              const lockPress = tapPress(() => props.studio.updateLayer(layer().id, { locked: !layer().locked }));
              return (
                <div
                  class={[styles.line, styles.layer, { [styles.active!]: layer().id === props.studio.activeLayer() }]}
                  style={place(index() + 1)}
                >
                  <button
                    class={[styles.layerToggle, { [styles.off!]: !layer().visible }]}
                    {...galleryUi}
                    {...visibilityPress}
                    title={layer().visible ? 'Hide' : 'Show'}
                  >
                    <SketchIcon name={layer().visible ? 'eye' : 'hidden'} size={15} />
                  </button>
                  <button class={styles.layerPick} {...galleryUi} {...pickPress}>
                    <LayerThumb studio={props.studio} layer={layer().id} width={34} height={23} class={styles.thumb} />
                    <span class={styles.layerText}>
                      <b>{layer().name}</b>
                      <small>{`${blendLabel(layer().blend)} · ${layer().opacity}%`}</small>
                    </span>
                  </button>
                  <button
                    class={[styles.layerToggle, { [styles.off!]: !layer().locked }]}
                    {...galleryUi}
                    {...lockPress}
                    title={layer().locked ? 'Unlock' : 'Lock'}
                  >
                    <SketchIcon name={layer().locked ? 'lock' : 'unlock'} size={13} />
                  </button>
                </div>
              );
            }}
          </For>
        }
      >
        <For each={blendLines}>
          {(modes, index) => (
            <div class={[styles.line, styles.blendLine]} style={place(index() + 1)}>
              <For each={modes}>
                {(mode) => {
                  const press = tapPress(() => {
                    props.studio.updateLayer(props.studio.activeLayer(), { blend: mode });
                    setBlending(false);
                  });
                  return (
                    <button
                      class={[styles.blendMode, { [styles.active!]: active()?.blend === mode }]}
                      {...galleryUi}
                      {...press}
                    >
                      {blendLabel(mode)}
                    </button>
                  );
                }}
              </For>
            </div>
          )}
        </For>
      </Show>

      <div class={styles.line} style={place(lines() - 2)}>
        <div
          ref={tappable}
          class={styles.slider}
          {...galleryUi}
          {...opacityPress}
          data-wheel="opacity"
          title="Layer opacity: drag or wheel"
        >
          <span class={styles.sliderFill} style={{ width: `${active()?.opacity ?? 0}%` }} />
          <span class={styles.sliderText}>
            <span>Opacity</span>
            {`${active()?.opacity ?? 0}%`}
          </span>
        </div>
      </div>

      <div class={styles.line} style={place(lines() - 1)}>
        <button
          class={[styles.blendButton, { [styles.open!]: blending() }]}
          {...galleryUi}
          {...blendPress}
          data-wheel="blend"
          title="Blend mode: tap for all modes, or use the wheel"
        >
          <span>Blend</span>
          <b>{active() ? blendLabel(active()!.blend) : ''}</b>
          <SketchIcon name={blending() ? 'up' : 'down'} size={13} />
        </button>
      </div>
    </div>
  );

  function setOpacity(event: PointerEvent, element: Element) {
    const box = element.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    props.studio.updateLayer(props.studio.activeLayer(), { opacity: Math.round(fraction * 100) });
  }
}

/** A small icon button in the panel's header. */
function LayerButton(props: {
  icon: SketchIconName;
  label: string;
  disabled?: boolean;
  press: ReturnType<typeof tapPress>;
}) {
  return (
    <button
      class={[styles.layerButton, { [styles.disabled!]: props.disabled === true }]}
      {...galleryUi}
      {...props.press}
      title={props.label}
      aria-disabled={props.disabled ? 'true' : 'false'}
    >
      <SketchIcon name={props.icon} size={15} />
    </button>
  );
}

/** The blend modes three to a line, as the mode grid shows them. */
const blendLines = Array.from({ length: Math.ceil(blendModes.length / 3) }, (_, line) =>
  blendModes.slice(line * 3, line * 3 + 3)
);

/**
 * The crescent's outline for the left hand: the inner edge on the circle around the disc, the outer edge the same
 * circle moved out by the line width, joined by level top and bottom edges.
 */
function crescentPath(height: number) {
  const top = -height / 2;
  const bottom = height / 2;
  const width = crescent.lineWidth + crescent.padding * 2;
  const { radius } = crescent;
  const topInner = crescentEdge(top);
  const bottomInner = crescentEdge(bottom);
  return (
    `M ${topInner} ${top} L ${topInner + width} ${top} ` +
    `A ${radius} ${radius} 0 0 1 ${bottomInner + width} ${bottom} ` +
    `L ${bottomInner} ${bottom} A ${radius} ${radius} 0 0 0 ${topInner} ${top} Z`
  );
}
