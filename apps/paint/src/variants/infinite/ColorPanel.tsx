import { createSignal, For, Match, Show, Switch } from 'solid-js';
import { hexToHsv, hsvToHex, type Hsv } from '../../features/color/hsv';
import { toneGray } from '../../features/color/toneLock';
import { LightingOrb } from '../../features/lighting-orb';
import styles from './ColorPanel.module.css';
import { ColorSliders } from './ColorSliders';
import { createColorCoordinates } from './createColorCoordinates';
import type { InfiniteColorSettings, InfiniteColorTab, InfiniteOrbSetup } from './createInfiniteColorSettings';
import { HsbWheel } from './HsbWheel';
import { InfiniteIcon, type InfiniteIconName } from './icons';
import { Slider } from './Slider';
import { CompactPalette, SwatchTab } from './Swatches';
import theme from './theme.module.css';

/**
 * Infinite Painter's main color panel, a floating card. Its header holds the color settings button, the color bar
 * (the previous color at the left, which a tap restores, and the current color at the right; with Compare tone, each
 * color's tone as a gray under it) and the eyedropper. Under it one of four synchronized tools, chosen by the icons
 * at the bottom: the HSB wheel, the color sliders, the swatch palettes and the Lighting Orb, the first two with the
 * compact palette under them. The gear swaps the tool for the color settings; a tab icon closes them again.
 *
 * Every edit calls `onInput` with the new color as it happens and `onCommit` with the color a drag ended on or a tap
 * chose, for the color history; the caller feeds the color back as `color`. The tab, Tone Lock and the other choices
 * are `settings`, which the panel changes through `onSettings`; `createInfiniteColorSettings` persists them.
 */
export function ColorPanel(props: {
  /** The current color, `#rrggbb`. */
  color: string;
  /** The color before the current one, `#rrggbb`, shown at the left of the color bar. */
  previous: string;
  /** The color history, newest first; the Swatch tab shows the first ten. */
  recent: readonly string[];
  settings: InfiniteColorSettings;
  onSettings: (patch: Partial<InfiniteColorSettings>) => void;
  onInput: (color: string) => void;
  onCommit: (color: string) => void;
  /** Starts picking a color from the canvas. */
  onEyedropper: () => void;
}) {
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  // The HSB coordinates the wheel and the HSB sliders share; grays keep the hue they were dragged from.
  const { coordinates: hsv, show } = createColorCoordinates(() => props.color, hexToHsv);
  const edit = (next: Hsv, hex: string) => {
    show(next, hex);
    props.onInput(hex);
  };
  const choose = (hex: string) => {
    props.onInput(hex);
    props.onCommit(hex);
  };
  const setOrb = (patch: Partial<InfiniteOrbSetup>) => props.onSettings({ orb: { ...props.settings.orb, ...patch } });

  return (
    <div class={[theme.panel, styles.panel]} role="dialog" aria-label="Color">
      <header class={styles.header}>
        <button
          class={theme.iconButton}
          aria-label={settingsOpen() ? 'Close the color settings' : 'Color settings'}
          aria-expanded={settingsOpen() ? 'true' : 'false'}
          onClick={() => setSettingsOpen((open) => !open)}
        >
          <InfiniteIcon name={settingsOpen() ? 'back' : 'settings'} size={20} />
        </button>
        <div class={styles.colorBar} data-tone={props.settings.compareTone ? '' : undefined}>
          <button
            class={styles.colorHalf}
            aria-label={`Previous color ${props.previous}: tap to restore`}
            title="Previous color · tap to restore"
            onClick={() => choose(props.previous)}
          >
            <span class={styles.colorFill} style={{ background: props.previous }} />
            <Show when={props.settings.compareTone}>
              <span class={styles.tone} style={{ background: toneGray(props.previous) }} />
            </Show>
          </button>
          <span class={styles.colorHalf} role="img" aria-label={`Current color ${props.color}`}>
            <span class={styles.colorFill} style={{ background: props.color }} />
            <Show when={props.settings.compareTone}>
              <span class={styles.tone} style={{ background: toneGray(props.color) }} />
            </Show>
          </span>
        </div>
        <button
          class={theme.iconButton}
          aria-label="Eyedropper"
          title="Eyedropper"
          onClick={() => props.onEyedropper()}
        >
          <InfiniteIcon name="eyedropper" size={20} />
        </button>
      </header>

      <div class={styles.content}>
        <Show
          when={!settingsOpen()}
          fallback={<ColorSettings settings={props.settings} onSettings={props.onSettings} />}
        >
          <Switch>
            <Match when={props.settings.tab === 'wheel'}>
              <div class={styles.tool}>
                <HsbWheel
                  hsv={hsv()}
                  color={props.color}
                  previous={props.previous}
                  toneLock={props.settings.toneLock}
                  onToneLock={() => props.onSettings({ toneLock: !props.settings.toneLock })}
                  onEdit={edit}
                  onCommit={props.onCommit}
                />
                <CompactPalette
                  palette={props.settings.palette}
                  onPalette={(palette) => props.onSettings({ palette })}
                  color={props.color}
                  onPick={choose}
                />
              </div>
            </Match>
            <Match when={props.settings.tab === 'sliders'}>
              <div class={styles.tool}>
                <ColorSliders
                  color={props.color}
                  hsv={hsv()}
                  model={props.settings.model}
                  onModel={(model) => props.onSettings({ model })}
                  onEdit={edit}
                  onCommit={props.onCommit}
                />
                <CompactPalette
                  palette={props.settings.palette}
                  onPalette={(palette) => props.onSettings({ palette })}
                  color={props.color}
                  onPick={choose}
                />
              </div>
            </Match>
            <Match when={props.settings.tab === 'swatches'}>
              <SwatchTab recent={props.recent} color={props.color} onPick={choose} />
            </Match>
            <Match when={props.settings.tab === 'orb'}>
              <OrbTab setup={props.settings.orb} onSetup={setOrb} onInput={props.onInput} onCommit={props.onCommit} />
            </Match>
          </Switch>
        </Show>
      </div>

      <nav class={styles.tabs} aria-label="Color tools">
        <For each={tabs}>
          {(tab) => (
            <button
              class={styles.tab}
              aria-pressed={!settingsOpen() && props.settings.tab === tab.id ? 'true' : 'false'}
              aria-label={tab.label}
              title={tab.label}
              onClick={() => {
                setSettingsOpen(false);
                props.onSettings({ tab: tab.id });
              }}
            >
              <InfiniteIcon name={tab.icon} size={20} />
            </button>
          )}
        </For>
      </nav>
    </div>
  );
}

const tabs: { id: InfiniteColorTab; label: string; icon: InfiniteIconName }[] = [
  { id: 'wheel', label: 'HSB color wheel', icon: 'wheel' },
  { id: 'sliders', label: 'Color sliders', icon: 'sliders' },
  { id: 'swatches', label: 'Swatch palettes', icon: 'swatches' },
  { id: 'orb', label: 'Lighting Orb', icon: 'orb' }
];

/**
 * The Lighting Orb tab: the orb with its chips, then Hue and Saturation sliders for the selected chip's color and the
 * Contrast slider. The orb's setup lives in the settings, so it stays as it was when the tab comes back.
 */
function OrbTab(props: {
  setup: InfiniteOrbSetup;
  onSetup: (patch: Partial<InfiniteOrbSetup>) => void;
  onInput: (color: string) => void;
  onCommit: (color: string) => void;
}) {
  // The selected chip's coordinates, so that a chip dragged to gray keeps its hue.
  const chip = createColorCoordinates(() => props.setup[props.setup.selected], hexToHsv);
  const editChip = (patch: Partial<Hsv>) => {
    const next = { ...chip.coordinates(), ...patch };
    const hex = hsvToHex(next);
    chip.show(next, hex);
    props.onSetup({ [props.setup.selected]: hex } as Partial<InfiniteOrbSetup>);
  };
  const chipHsv = () => chip.coordinates();

  return (
    <div class={styles.orbTab}>
      <LightingOrb
        lights={props.setup}
        picker={props.setup.picker}
        selected={props.setup.selected}
        onSelect={(selected) => props.onSetup({ selected })}
        onPicker={(picker) => props.onSetup({ picker })}
        onInput={props.onInput}
        onCommit={props.onCommit}
        size={172}
      />
      <div class={styles.sliderBox}>
        <Slider
          label="Hue"
          min={0}
          max={359}
          step={1}
          value={chipHsv().h}
          format={(h) => `${Math.round(h)}°`}
          background="linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)"
          onInput={(h) => editChip({ h })}
          onChange={(h) => editChip({ h })}
        />
        <Slider
          label="Saturation"
          min={0}
          max={100}
          step={1}
          value={chipHsv().s * 100}
          format={(s) => `${Math.round(s)}`}
          background={`linear-gradient(to right, ${hsvToHex({ ...chipHsv(), s: 0 })}, ${hsvToHex({ ...chipHsv(), s: 1 })})`}
          onInput={(s) => editChip({ s: s / 100 })}
          onChange={(s) => editChip({ s: s / 100 })}
        />
      </div>
      <Slider
        label="Contrast"
        min={0}
        max={100}
        step={1}
        value={props.setup.contrast * 100}
        onInput={(contrast) => props.onSetup({ contrast: contrast / 100 })}
        onChange={(contrast) => props.onSetup({ contrast: contrast / 100 })}
      />
    </div>
  );
}

/**
 * The color settings that concern this panel and the toolbar: Tone Lock, the Recent Colors strip and Compare tone.
 * The eyedropper, rendering and wheel-style settings of the app's panel are left out.
 */
function ColorSettings(props: {
  settings: InfiniteColorSettings;
  onSettings: (patch: Partial<InfiniteColorSettings>) => void;
}) {
  return (
    <section class={styles.settings} aria-label="Color settings">
      <h3 class={theme.sectionTitle}>Interface</h3>
      <Toggle
        label="Tone Lock"
        note="Keeps the tone when the hue changes. Tap the wheel's hue pointer to switch it."
        checked={props.settings.toneLock}
        onChange={(toneLock) => props.onSettings({ toneLock })}
      />
      <Toggle
        label="Recent Colors strip"
        note="The color history beside the main toolbar."
        checked={props.settings.recentStrip}
        onChange={(recentStrip) => props.onSettings({ recentStrip })}
      />
      <Toggle
        label="Compare tone"
        note="Shows each color's tone as a gray under the color bar."
        checked={props.settings.compareTone}
        onChange={(compareTone) => props.onSettings({ compareTone })}
      />
    </section>
  );
}

/** A settings row with Infinite Painter's switch, red while on. */
function Toggle(props: { label: string; note: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      class={styles.toggle}
      role="switch"
      aria-checked={props.checked ? 'true' : 'false'}
      onClick={() => props.onChange(!props.checked)}
    >
      <span class={styles.toggleText}>
        {props.label}
        <small>{props.note}</small>
      </span>
      <span class={styles.switch} />
    </button>
  );
}
