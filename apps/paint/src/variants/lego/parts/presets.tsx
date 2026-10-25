import { createSignal, onSettled, Show } from 'solid-js';
import { PresetStroke } from '../../../features/brush-library/PresetStroke';
import { cellGap, pitch } from '../board';
import type { LegoServices } from '../LegoServices';
import styles from '../LegoStudio.module.css';
import { definePart, type PartBinding } from './definition';

/** Presets share one static binding; only the stored suffix selects the library entry. */
export const presetPart = definePart({
  kind: 'preset:*',
  family: 'preset',
  section: 'Brushes',
  label: 'Brush',
  icon: 'brush',
  needs: presetNeeds,
  View: PresetPart
});

/** Controlled library sample. Its renderer owns only cacheable preview resources and releases them on disposal. */
function PresetPart(props: ReturnType<typeof presetNeeds>) {
  let tile!: HTMLButtonElement;
  const [backgrounds, setBackgrounds] = createSignal<{ normal: string; active: string }>();
  const named = () => props.span.columns >= 2;
  const large = () => props.span.rows >= 2;
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

const length = (cells: number) => cells * pitch - cellGap;

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
