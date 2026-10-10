import { createSignal, For } from 'solid-js';
import { createRecentColors } from '../../features/color/createRecentColors';
import { hexToHsv, hsvToHex, parseHex, type Hsv } from '../../features/color/hsv';
import { HueTriangle } from '../../features/hue-triangle';
import { ScrubField } from './controls';
import styles from './panels.module.css';

/**
 * The Color panel: the foreground or the background color, as the tool column's swatches choose, on a hue ring
 * around a saturation and value triangle, with hue, saturation and value as scrub fields, the hex code, and the
 * recently used colors. Edits apply live; a color joins the recent ones when an edit ends.
 */
export function ColorPanel(props: {
  foreground: string;
  background: string;
  /** The color being edited. */
  target: 'color' | 'backgroundColor';
  onTarget: (target: 'color' | 'backgroundColor') => void;
  /** Receives the edited color as a brush patch. */
  onChange: (patch: { color?: string; backgroundColor?: string }) => void;
}) {
  const recent = createRecentColors();
  const hex = () => (props.target === 'color' ? props.foreground : props.background);
  // Keeps the written HSV while it still produces the color, so hue and saturation survive grays and black.
  const [hsv, setHsv] = createSignal<Hsv>((previous) =>
    previous && hsvToHex(previous) === hex() ? previous : hexToHsv(hex(), previous)
  );
  const apply = (color: string) => props.onChange({ [props.target]: color });
  const editHsv = (patch: Partial<Hsv>) => {
    const next = { ...hsv(), ...patch };
    setHsv(next);
    apply(hsvToHex(next));
  };

  return (
    <div class={styles.color}>
      <div class={styles.colorRow}>
        <div class={styles.targets} role="radiogroup" aria-label="Edited color">
          <button
            role="radio"
            aria-checked={props.target === 'color' ? 'true' : 'false'}
            title="Edit the foreground color"
            onClick={() => props.onTarget('color')}
          >
            <span class={styles.chip} style={{ background: props.foreground }} />
            Foreground
          </button>
          <button
            role="radio"
            aria-checked={props.target === 'backgroundColor' ? 'true' : 'false'}
            title="Edit the background color"
            onClick={() => props.onTarget('backgroundColor')}
          >
            <span class={styles.chip} style={{ background: props.background }} />
            Background
          </button>
        </div>
        <input
          class={styles.hex}
          aria-label="Hex color"
          spellcheck={false}
          value={hex()}
          onChange={(event) => {
            const parsed = parseHex(event.currentTarget.value);
            event.currentTarget.value = parsed ?? hex();
            if (parsed) {
              apply(parsed);
              recent.remember(parsed);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur();
            }
          }}
        />
      </div>
      <div class={styles.triangle}>
        <HueTriangle color={hex()} onChange={apply} onSettle={() => recent.remember(hex())} />
      </div>
      <div class={styles.hsv}>
        <ScrubField
          caption="H"
          label="Hue"
          value={Math.round(hsv().h)}
          min={0}
          max={360}
          wrap
          unit="°"
          width={64}
          onInput={(h) => editHsv({ h: h % 360 })}
          onChange={(h) => {
            editHsv({ h: h % 360 });
            recent.remember(hex());
          }}
        />
        <ScrubField
          caption="S"
          label="Saturation"
          value={Math.round(hsv().s * 100)}
          min={0}
          max={100}
          unit="%"
          width={60}
          onInput={(s) => editHsv({ s: s / 100 })}
          onChange={(s) => {
            editHsv({ s: s / 100 });
            recent.remember(hex());
          }}
        />
        <ScrubField
          caption="V"
          label="Value"
          value={Math.round(hsv().v * 100)}
          min={0}
          max={100}
          unit="%"
          width={60}
          onInput={(v) => editHsv({ v: v / 100 })}
          onChange={(v) => {
            editHsv({ v: v / 100 });
            recent.remember(hex());
          }}
        />
      </div>
      <div class={styles.recent} aria-label="Recent colors">
        <For each={recent.colors().slice(0, 14)}>
          {(color) => (
            <button
              class={styles.swatch}
              style={{ background: color }}
              aria-label={`Use ${color}`}
              title={color}
              onClick={() => apply(color)}
            />
          )}
        </For>
      </div>
    </div>
  );
}
