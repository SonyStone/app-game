import { createSignal, For, onCleanup } from 'solid-js';
import { hexToHsv, hsvToHex, luminance, type Hsv } from '../../../../features/color/hsv';
import { palette } from '../../kit/catalog';
import type { Studio } from '../../kit/createStudio';
import type { Press } from '../../kit/pressHandlers';
import { pressable } from './controls';
import styles from './Deck.module.css';

/**
 * The color card: a saturation-value field and a hue strip (press and drag; the color follows live and commits on
 * the lift), the current color over the previous one (tap the previous to swap back to it), recent colors and the
 * palette. Picking a swatch or the previous color is a finished action (`done`); dragging in the picker is not.
 */
export function ColorCard(props: { studio: Studio; done: () => void }) {
  // Keeps the edited HSV while it still produces the color, so that the hue survives grays and black.
  const [hsv, setHsv] = createSignal<Hsv>((previous) =>
    previous && hsvToHex(previous) === props.studio.color() ? previous : hexToHsv(props.studio.color(), previous)
  );
  const edit = (next: Hsv) => {
    setHsv(next);
    props.studio.setColor(hsvToHex(next));
  };
  /** Where a press lies in its element, 0–1 on both axes. */
  const local = (press: Press) => {
    const box = press.target.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (press.point.x - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (press.point.y - box.top) / box.height))
    };
  };
  const field = pressable({
    start: (press) => edit({ ...hsv(), s: local(press).x, v: 1 - local(press).y }),
    move: (press) => edit({ ...hsv(), s: local(press).x, v: 1 - local(press).y }),
    end: () => props.studio.commitColor(),
    cancel: () => props.studio.commitColor()
  });
  const strip = pressable({
    start: (press) => edit({ ...hsv(), h: Math.min(359.9, local(press).y * 360) }),
    move: (press) => edit({ ...hsv(), h: Math.min(359.9, local(press).y * 360) }),
    end: () => props.studio.commitColor(),
    cancel: () => props.studio.commitColor()
  });
  /** Commits wheel edits once the wheel rests, so that each notch does not become a recent color. */
  let wheelCommit: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(wheelCommit));
  const choose = (color: string) => {
    props.studio.chooseColor(color);
    props.done();
  };
  const previous = pressable({
    tap() {
      props.studio.swapColors();
      props.done();
    }
  });

  return (
    <div class={styles.body}>
      <div class={styles.picker}>
        <div
          class={styles.field}
          style={{ '--hue': `hsl(${hsv().h} 100% 50%)` }}
          title="Saturation and value: press and drag"
          {...field}
        >
          <span
            class={styles.fieldMarker}
            style={{
              left: `${hsv().s * 100}%`,
              top: `${(1 - hsv().v) * 100}%`,
              'border-color': luminance(props.studio.color()) > 0.45 ? '#111' : '#fff'
            }}
          />
        </div>
        <div
          class={styles.hueStrip}
          title="Hue: press and drag; wheel"
          onWheel={(event) => {
            event.preventDefault();
            edit({ ...hsv(), h: (hsv().h + (event.deltaY > 0 ? 4 : -4) + 360) % 360 });
            clearTimeout(wheelCommit);
            wheelCommit = setTimeout(() => props.studio.commitColor(), 450);
          }}
          {...strip}
        >
          <span class={styles.hueMarker} style={{ top: `${(hsv().h / 360) * 100}%` }} />
        </div>
        <div class={styles.swatchColumn}>
          <span class={styles.current} style={{ background: props.studio.color() }} title="Current color" />
          <span
            class={styles.previous}
            style={{ background: props.studio.previous() }}
            title="Previous color: tap to swap (X)"
            {...previous}
          >
            <kbd class={styles.kbd}>X</kbd>
          </span>
          <span class={styles.hex}>{props.studio.color().slice(1).toUpperCase()}</span>
        </div>
      </div>

      <h4 class={styles.section}>
        Recent<span>tap to paint</span>
      </h4>
      <div class={styles.recent}>
        <For each={props.studio.recent().slice(0, 10)}>
          {(color) => <Swatch color={color} current={props.studio.color()} onChoose={choose} />}
        </For>
      </div>

      <h4 class={styles.section}>Palette</h4>
      <div class={styles.palette}>
        <For each={palette}>{(color) => <Swatch color={color} current={props.studio.color()} onChoose={choose} />}</For>
      </div>
    </div>
  );
}

/** A color to tap; ringed while it is the current color. */
function Swatch(props: { color: string; current: string; onChoose: (color: string) => void }) {
  const press = pressable({ tap: () => props.onChoose(props.color) });
  return (
    <span
      class={[styles.swatch, { [styles.on!]: props.color === props.current }]}
      style={{ background: props.color }}
      title={props.color}
      {...press}
    />
  );
}
