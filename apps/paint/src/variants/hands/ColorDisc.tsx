import { createEffect } from 'solid-js';
import { hsvToHex, type Hsv } from '../../features/color/hsv';
import { discPoint, paintDisc } from '../../shared/ui/colorDisc';
import styles from './ColorDisc.module.css';
import { disc } from './disc';
import type { Point } from './geometry';

/**
 * The color disc under the free hand's finger, in client pixels: a hue ring around a saturation × brightness disc
 * (see `disc`), with markers at the chosen hue and color, and a swatch above the finger comparing the new color (top)
 * with the one it replaces (bottom), since the finger hides the disc under it. Display only: the free hand's touch
 * drives it.
 */
export function ColorDisc(props: { center: Point; finger: Point; color: Hsv; original: string }) {
  let canvas!: HTMLCanvasElement;
  const marker = () => {
    const { u, v } = discPoint(props.color.s, props.color.v);
    return { x: u * disc.inner, y: v * disc.inner };
  };
  const hueAngle = () => (props.color.h * Math.PI) / 180;
  const hueRadius = (disc.outer + disc.ringInner) / 2;
  /** Above the finger, or below it near the top of the screen. */
  const swatchY = () => (props.finger.y - swatchOffset < swatchSize ? props.finger.y + swatchOffset : props.finger.y - swatchOffset);

  createEffect(
    () => props.color.h,
    (hue) => paintDisc(canvas, hue, Math.round(disc.inner * 2 * Math.min(2, devicePixelRatio || 1)))
  );

  return (
    <div class={styles.layer} aria-hidden="true">
      <div
        class={styles.disc}
        style={{
          left: `${props.center.x}px`,
          top: `${props.center.y}px`,
          width: `${disc.outer * 2}px`,
          height: `${disc.outer * 2}px`
        }}
      >
        <span
          class={styles.hues}
          style={{ mask: `radial-gradient(circle, transparent ${disc.ringInner - 0.5}px, #000 ${disc.ringInner}px)` }}
        />
        <canvas
          ref={canvas}
          class={styles.inner}
          style={{ width: `${disc.inner * 2}px`, height: `${disc.inner * 2}px` }}
        />
        <span
          class={styles.marker}
          style={{
            left: `${disc.outer + marker().x}px`,
            top: `${disc.outer + marker().y}px`,
            background: hsvToHex(props.color)
          }}
        />
        <span
          class={styles.marker}
          style={{
            left: `${disc.outer + Math.cos(hueAngle()) * hueRadius}px`,
            top: `${disc.outer + Math.sin(hueAngle()) * hueRadius}px`,
            background: hsvToHex({ h: props.color.h, s: 1, v: 1 })
          }}
        />
      </div>
      <span class={styles.swatch} style={{ left: `${props.finger.x}px`, top: `${swatchY()}px` }}>
        <span style={{ background: hsvToHex(props.color) }} />
        <span style={{ background: props.original }} />
      </span>
    </div>
  );
}

/** Diameter of the comparison swatch, in CSS pixels. */
const swatchSize = 64;

/** Distance from the finger to the swatch's center, in CSS pixels. */
const swatchOffset = 92;
