import { createEffect, createSignal, For } from 'solid-js';
import { hexToHsv, type Hsv } from '../../../../features/color/hsv';
import { palette } from '../../kit/catalog';
import type { Studio } from '../../kit/createStudio';
import { pressHandlers, type Press } from '../../kit/pressHandlers';
import { galleryUi } from '../../kit/variant';
import styles from './ColorCard.module.css';
import { TapButton } from './controls';
import { discColor, discPoint, paintDisc } from './disc';
import css from './glass.module.css';
import { placed, type Box } from './layout';

/**
 * Procreate's Colors popover in Disc mode: a hue ring around a saturation-and-brightness disc (no numbers), the
 * previous and current colors at the top right (tap the previous one to swap), the recent colors and a palette.
 * Dragging on the Disc edits the color live and commits it on lift; picking a recent or palette color finishes.
 */
export function ColorCard(props: { studio: Studio; box: Box; done: () => void }) {
  const choose = (hex: string) => {
    props.studio.chooseColor(hex);
    props.done();
  };

  return (
    <section class={[css.card, styles.card]} style={placed(props.box)} {...galleryUi}>
      <header class={css.cardHeader}>
        <h3>Colors</h3>
        <TapButton
          class={[styles.swatch, styles.previous]}
          style={{ background: props.studio.previous() }}
          title="Previous color: tap to swap (X)"
          onTap={() => props.studio.swapColors()}
        />
        <span class={styles.swatch} style={{ background: props.studio.color() }} title="Current color" />
      </header>
      <Disc studio={props.studio} />
      <div class={styles.row}>
        <For each={props.studio.recent().slice(0, 8)}>
          {(hex) => (
            <TapButton
              class={[styles.recent, { [styles.on!]: hex === props.studio.color() }]}
              style={{ background: hex }}
              title={hex}
              onTap={() => choose(hex)}
            />
          )}
        </For>
      </div>
      <div class={styles.palette}>
        <For each={palette}>
          {(hex) => (
            <TapButton
              class={[styles.chip, { [styles.on!]: hex === props.studio.color() }]}
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
 * is committed when the press lifts (a cancelled press restores the color before it). Keeps its own HSV while the
 * color matches it, so that greys and black keep the hue and saturation they were dragged from.
 */
function Disc(props: { studio: Studio }) {
  let canvas!: HTMLCanvasElement;
  const [hsv, setHsv] = createSignal<Hsv>((previous) => {
    const hex = props.studio.color();
    return previous && props.studio.hsvToHex(previous) === hex ? previous : hexToHsv(hex, previous);
  });
  let mode: 'hue' | 'disc' = 'disc';
  let before = '';

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
    props.studio.setColor(props.studio.hsvToHex(next));
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
      before = props.studio.color();
      apply(press);
    },
    move: apply,
    end: () => props.studio.commitColor(),
    tap: () => props.studio.commitColor(),
    cancel: () => props.studio.setColor(before)
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
          background: props.studio.hsvToHex({ h: hsv().h, s: 1, v: 1 })
        }}
      />
      <span
        class={[styles.thumb, styles.discThumb]}
        style={{
          left: `calc(50% + ${discThumb().x}px)`,
          top: `calc(50% + ${discThumb().y}px)`,
          background: props.studio.color()
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
