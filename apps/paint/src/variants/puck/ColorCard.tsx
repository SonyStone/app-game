import { createEffect, createSignal, For, untrack } from 'solid-js';
import { createRecentColors } from '../../features/color/createRecentColors';
import { hexToHsv, hsvToHex, type Hsv } from '../../features/color/hsv';
import { discColor, discPoint, paintDisc } from '../../shared/ui/colorDisc';
import { pressHandlers, type Press } from '../../shared/ui/pressHandlers';
import css from './cluster.module.css';
import styles from './ColorCard.module.css';
import { TapButton } from './controls';
import { placed, type Box } from './layout';

/**
 * Procreate's Colors popover in Disc mode, on the brush colors: a hue ring around a saturation-and-brightness disc
 * (no numbers), the background and foreground colors at the top right (tap the background color to swap them, as X
 * does), the recent colors (shared with the Classic editor) and a palette. Dragging on the Disc edits the color live
 * and remembers it among the recent colors on lift, keeping the card open; picking a recent or palette color
 * finishes. Mix, in the header, opens or closes the session's mixing palette window and finishes.
 */
export function ColorCard(props: {
  /** The session's shared history. Omit only for a standalone picker with its own history; stable until unmount. */
  recentColors?: ReturnType<typeof createRecentColors>;
  box: Box;
  /** The foreground color, `#rrggbb`. */
  color: string;
  background: string;
  onColor: (hex: string) => void;
  onSwap: () => void;
  /** Whether the session's mixing palette window is open. */
  mixing: boolean;
  onMixing: () => void;
  done: () => void;
}) {
  const recent = untrack(() => props.recentColors ?? createRecentColors());
  const choose = (hex: string) => {
    props.onColor(hex);
    recent.remember(hex);
    props.done();
  };

  return (
    <section class={[css.card, styles.card]} style={placed(props.box)}>
      <header class={css.cardHeader}>
        <h3>Colors</h3>
        <TapButton
          class={[styles.mix, { [styles.on!]: props.mixing }]}
          title="Mixing palette"
          onTap={() => {
            props.onMixing();
            props.done();
          }}
        >
          Mix
        </TapButton>
        <TapButton
          class={[styles.swatch, styles.previous]}
          style={{ background: props.background }}
          title="Background color: tap to swap (X)"
          onTap={() => props.onSwap()}
        />
        <span class={styles.swatch} style={{ background: props.color }} title="Foreground color" />
      </header>
      <Disc color={props.color} onColor={props.onColor} onCommit={(hex) => recent.remember(hex)} />
      <div class={styles.row}>
        <For each={recent.colors().slice(0, 8)}>
          {(hex) => (
            <TapButton
              class={[styles.recent, { [styles.on!]: hex === props.color }]}
              style={{ background: hex }}
              title={hex}
              onTap={() => choose(hex)}
            />
          )}
        </For>
        {/* Free places for colors not used yet, so that the row keeps its rhythm. */}
        <For each={Array.from({ length: Math.max(0, 8 - recent.colors().length) })}>
          {() => <span class={styles.unused} />}
        </For>
      </div>
      <div class={styles.palette}>
        <For each={palette}>
          {(hex) => (
            <TapButton
              class={[styles.chip, { [styles.on!]: hex === props.color }]}
              style={{ background: hex }}
              title={hex}
              onTap={() => choose(hex)}
            />
          )}
        </For>
      </div>
    </section>
  );
}

/**
 * The Disc: press on the ring to turn the hue, inside to pick saturation and brightness; the color follows live and
 * `onCommit` receives it when the press lifts (a cancelled press restores the color before it). Keeps its own HSV
 * while the color matches it, so that greys and black keep the hue and saturation they were dragged from.
 */
function Disc(props: { color: string; onColor: (hex: string) => void; onCommit: (hex: string) => void }) {
  let canvas!: HTMLCanvasElement;
  const [hsv, setHsv] = createSignal<Hsv>((previous) =>
    previous && hsvToHex(previous) === props.color ? previous : hexToHsv(props.color, previous)
  );
  let mode: 'hue' | 'disc' = 'disc';
  let before = '';
  /** The color last set by this press; reading `props.color` in the same event would still return the old one. */
  let latest = '';

  createEffect(
    () => hsv().h,
    (hue) => {
      const frame = requestAnimationFrame(() =>
        paintDisc(canvas, hue, Math.round(innerSize * Math.min(2, devicePixelRatio || 1)))
      );
      return () => cancelAnimationFrame(frame);
    }
  );

  const apply = (press: Press) => {
    const rect = press.target.getBoundingClientRect();
    const unit = discSize / rect.width;
    const dx = (press.point.x - (rect.left + rect.width / 2)) * unit;
    const dy = (press.point.y - (rect.top + rect.height / 2)) * unit;
    const current = hsv();
    let next: Hsv;
    if (mode === 'hue') {
      next = { ...current, h: ((((Math.atan2(dx, -dy) * 180) / Math.PI) % 360) + 360) % 360 };
    } else {
      const { saturation, value } = discColor(dx / innerRadius, dy / innerRadius);
      next = { ...current, s: saturation, v: value };
    }

    setHsv(next);
    latest = hsvToHex(next);
    props.onColor(latest);
  };
  const hueThumb = () => {
    const angle = (hsv().h * Math.PI) / 180;
    return { x: Math.sin(angle) * ringMiddle, y: -Math.cos(angle) * ringMiddle };
  };
  const discThumb = () => {
    const { u, v } = discPoint(hsv().s, hsv().v);
    return { x: u * innerRadius, y: v * innerRadius };
  };

  const press = pressHandlers({
    start: (press) => {
      const rect = press.target.getBoundingClientRect();
      const distance =
        Math.hypot(press.point.x - (rect.left + rect.width / 2), press.point.y - (rect.top + rect.height / 2)) *
        (discSize / rect.width);
      mode = distance >= innerRadius + 3 ? 'hue' : 'disc';
      before = props.color;
      apply(press);
    },
    move: apply,
    end: () => props.onCommit(latest),
    tap: () => props.onCommit(latest),
    cancel: () => props.onColor(before)
  });

  return (
    <div class={styles.disc} {...press}>
      <span class={styles.ring} />
      <span class={styles.inner}>
        <canvas ref={canvas} />
      </span>
      <span
        class={styles.thumb}
        style={{
          left: `calc(50% + ${hueThumb().x}px)`,
          top: `calc(50% + ${hueThumb().y}px)`,
          background: hsvToHex({ h: hsv().h, s: 1, v: 1 })
        }}
      />
      <span
        class={[styles.thumb, styles.discThumb]}
        style={{
          left: `calc(50% + ${discThumb().x}px)`,
          top: `calc(50% + ${discThumb().y}px)`,
          background: props.color
        }}
      />
    </div>
  );
}

/** The Disc's diameter, the ring's width and the gap between the ring and the inner circle, in CSS pixels. */
const discSize = 184;
const ringWidth = 22;
const ringGap = 6;
const innerRadius = discSize / 2 - ringWidth - ringGap;
const innerSize = innerRadius * 2;
const ringMiddle = discSize / 2 - ringWidth / 2;

/** A painter's starting palette: neutrals, then muted and saturated hues. */
const palette = [
  '#111111',
  '#3a3a3a',
  '#6b6b6b',
  '#9e9e9e',
  '#d0d0d0',
  '#ffffff',
  '#262329',
  '#5a3a22',
  '#a7795a',
  '#d9c4a5',
  '#efeae1',
  '#b9c2b4',
  '#c4463a',
  '#e0703a',
  '#e6b93d',
  '#7aa05a',
  '#3d8a7a',
  '#3d6a8c',
  '#5a4e9a',
  '#9a4e8a',
  '#e88aa0',
  '#f2d06b',
  '#9fd3c7',
  '#8fb3e0'
] as const;
