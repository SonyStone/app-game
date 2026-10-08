import { createMemo, createUniqueId, For } from 'solid-js';
import { luminance } from '../../../../features/color/hsv';
import { presets, type Preset } from '../../kit/catalog';
import type { Studio } from '../../kit/createStudio';
import { galleryUi } from '../../kit/variant';
import type { Captions } from './Caption';
import { disc, polar, presetAngle } from './geometry';
import styles from './Orbit.module.css';
import { tapPress } from './tapPress';

/**
 * The ring of brush presets, Krita's pop-up palette's signature: twelve round slots, each a small stroke painted at
 * the preset's size, softness and opacity in the current color. A tap applies the preset and is a finished action;
 * the wheel over the ring and the `,` `.` keys cycle presets (handled by the Orbit). The preset's name shows on the
 * rim beside the slot while the pointer hovers or a finger holds it.
 */
export function PresetRing(props: { studio: Studio; captions: Captions; done: () => void }) {
  return (
    <For each={presets} keyed={false}>
      {(preset, index) => {
        const at = polar(presetAngle(index), disc.presets);
        const caption = polar(presetAngle(index), disc.track);
        const owner = `preset-${index}`;
        const show = () => props.captions.show(owner, preset().name, caption, ', .');
        const press = tapPress(
          () => {
            props.studio.choosePreset(preset().id);
            props.done();
          },
          { onStart: show, onFinish: () => props.captions.hide(owner) }
        );
        return (
          <button
            class={[styles.slot, { [styles.active!]: props.studio.preset() === preset().id }]}
            {...galleryUi}
            {...press}
            onPointerEnter={(event) => event.pointerType !== 'touch' && show()}
            onPointerLeave={() => props.captions.hide(owner)}
            data-part="ui"
            data-wheel="presets"
            aria-label={preset().name}
            style={{ left: `${at.x}px`, top: `${at.y}px` }}
          >
            <PresetDab preset={preset()} color={props.studio.color()} other={props.studio.previous()} />
          </button>
        );
      }}
    </For>
  );
}

/**
 * A preset's thumbnail: an S-stroke of round dabs across a paper disc, thick by the preset's size (geometrically),
 * blurred by its softness, faded by its opacity and tapered when it follows pressure. Mixer presets smear from the
 * current color into the previous one; erasers cut a pale stroke out of a grey band. The paper darkens behind very
 * light colors so that they still show.
 */
export function PresetDab(props: { preset: Preset; color: string; other: string }) {
  const id = createUniqueId();
  const number = (key: string, fallback: number) => {
    const found = props.preset.values[key];
    return typeof found === 'number' ? found : fallback;
  };
  const thickness = () => 1.6 + (Math.log2(number('size', 10) / 0.7) / Math.log2(1000 / 0.7)) * 15.4;
  const blur = () => ((100 - number('hardness', 100)) / 100) * thickness() * 0.4;
  const erase = () => props.preset.tool === 'eraser';
  const paper = () => (luminance(props.color) > 0.55 && !erase() ? '#3a3f44' : '#e4e6e8');
  /** The dabs' places and sizes, which depend only on the preset; colors follow the current color separately. */
  const dabs = createMemo(() => {
    const pressure = props.preset.values.pressureSize === true;
    return Array.from({ length: dabCount }, (_, step) => {
      const t = step / (dabCount - 1);
      const taper = pressure ? Math.max(0.22, Math.sin(Math.PI * (0.06 + t * 0.9))) : 1;
      return { t, x: -14 + t * 28, y: -Math.sin(t * Math.PI * 2) * 5.5, r: (thickness() / 2) * taper };
    });
  });
  /** A dab's color: the current color, smeared toward the previous one along a mixer's stroke. */
  const dabColor = (t: number) => {
    if (erase()) {
      return paper();
    }

    const wet = props.preset.tool === 'mixer' ? number('wet', 50) / 100 : 0;
    return wet > 0 ? mix(props.color, props.other, t * wet) : props.color;
  };

  return (
    <svg class={styles.dab} viewBox="-22 -22 44 44" aria-hidden="true">
      <defs>
        <clipPath id={`${id}-clip`}>
          <circle r="21" />
        </clipPath>
        <filter id={`${id}-blur`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={blur()} />
        </filter>
      </defs>
      <circle r="22" fill={paper()} />
      <g clip-path={`url(#${id}-clip)`}>
        {erase() && <rect x="-22" y="-7" width="44" height="14" fill="#8b9297" />}
        <g filter={blur() > 0.2 ? `url(#${id}-blur)` : undefined} opacity={number('opacity', 100) / 100}>
          <For each={dabs()}>{(dab) => <circle cx={dab.x} cy={dab.y} r={dab.r} fill={dabColor(dab.t)} />}</For>
        </g>
      </g>
    </svg>
  );
}

const dabCount = 24;

/** Mixes two `#rrggbb` colors; `amount` 0 gives `a`, 1 gives `b`. */
function mix(a: string, b: string, amount: number) {
  const channels = (hex: string) => [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
  const from = channels(a);
  const to = channels(b);
  return `#${from
    .map((channel, index) =>
      Math.round(channel + (to[index]! - channel) * amount)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;
}
