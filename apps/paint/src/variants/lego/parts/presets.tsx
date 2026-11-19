import { createSignal, onSettled, Show } from 'solid-js';
import { PresetStroke } from '../../../features/brush-library/PresetStroke';
import { useGrid } from '../grid';
import type { LegoServices } from '../LegoServices';
import styles from '../LegoStudio.module.css';
import { fits, type TextStyle } from '../textFit';
import { definePart, type PartBinding } from './definition';

/** Presets share one static binding; only the stored suffix selects the library entry. */
export const presetPart = definePart({
  kind: 'preset:*',
  family: 'preset',
  group: 'brush',
  section: 'Brushes',
  label: 'Brush',
  icon: 'brush',
  needs: presetNeeds,
  View: PresetPart
});

/**
 * Controlled library sample. Its renderer owns only cacheable preview resources and releases them on disposal. From
 * `largePreset` pixels high the sample fills the part over the brush's name; lower, a one-cell sample stands beside
 * it. The name shows where it fits whole.
 */
function PresetPart(props: ReturnType<typeof presetNeeds>) {
  const { length } = useGrid();
  let tile!: HTMLButtonElement;
  const [backgrounds, setBackgrounds] = createSignal<{ normal: string; active: string }>();
  const large = () => length(props.span.rows) >= largePreset;
  const named = () =>
    props.preset !== undefined &&
    fits(
      props.preset.name,
      presetNameStyle,
      length(props.span.columns) - (large() ? 2 * presetNameInset : length(1) + presetNameGap + presetNameInset)
    );
  const height = () => length(props.span.rows) - (large() && named() ? 22 : 0);

  // The preview engine accepts hex colors only; read the CSS palette once after the tile is connected.
  onSettled(() => {
    const palette = getComputedStyle(tile);
    setBackgrounds({
      normal: palette.getPropertyValue('--lego-tile').trim(),
      active: palette.getPropertyValue('--lego-preset-active').trim()
    });
  });

  return (
    <button
      ref={tile}
      type="button"
      class={[styles.preset, large() && styles.large]}
      data-active={props.active ? '' : undefined}
      aria-label={props.preset?.name ?? 'Brush'}
      onClick={props.choose}
    >
      <Show when={props.preset} fallback={<span class={styles.unknown}>?</span>}>
        {(preset) => (
          <>
            <span
              class={styles.sample}
              style={{ width: large() || !named() ? '100%' : `${length(1)}px`, height: `${height()}px` }}
            >
              <PresetStroke
                preset={preset()}
                resources={props.resources}
                color={props.color}
                height={height()}
                background={props.active ? backgrounds()?.active : backgrounds()?.normal}
                overrideColor
              />
            </span>
            <Show when={named()}>
              <span class={styles.name}>{preset().name}</span>
            </Show>
          </>
        )}
      </Show>
    </button>
  );
}

/** The height in CSS pixels from which a preset stacks its sample over its name. */
const largePreset = 60;
/** How `.preset` sets a name: its type, its inset from the tile's side and its gap after a one-cell sample. */
const presetNameStyle: TextStyle = { size: 13, weight: 600 };
const presetNameInset = 8;
const presetNameGap = 4;

function presetNeeds(services: LegoServices, frame: PartBinding) {
  const id = () => frame.kind.slice('preset:'.length);
  return {
    get preset() {
      return services.presets.all().find((preset) => preset.id === id());
    },
    get color() {
      return services.color.value();
    },
    get span() {
      return frame.span;
    },
    get active() {
      return services.tools.current() === 'brush' && services.tools.preset() === id();
    },
    resources: services.presets.resources,
    choose: frame.command(() => services.presets.choose(id()))
  };
}
