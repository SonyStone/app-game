import { createEventListener } from '@solid-primitives/event-listener';
import { createEffect, createSignal, Show } from 'solid-js';
import { SketchIcon, type SketchIconName } from '../../../shared/ui/SketchIcon';
import styles from '../LegoStudio.module.css';
import { fitText, type TextStyle } from '../textFit';

/**
 * How a value part too small for a caption tells which value it is: a knob, and a number look whose caption does not
 * fit. TEMPORARY: a trial of the treatments, chosen as a whole with `ValueFaceSwitch` until the user picks one; then
 * the chosen one stays, and this switch, `valueFaceKey` and the treatments not chosen go.
 *
 * - `plain`: the number alone, as before the trial.
 * - `name`: the channel's short name set small above the number (see `oneCellFace`).
 * - `glyph`: an icon for the kind of value above the number (see `valueGlyph`).
 * - `approach`: the number alone, and the full name in a tag beside the part while a pen or mouse hovers over it or
 *   the part is pressed, with the value while it is pressed (see `createNameTag`).
 * - `gauge`: the knob's arc sweeps 270° like a hardware knob's scale, and the short name sits in the opening at the
 *   bottom, under the number; the tag of `approach` names it in full.
 */
export type ValueFace = (typeof valueFaces)[number]['id'];

/** The trial's treatments in the order the switch steps through them, each with the name the switch shows. */
export const valueFaces = [
  { id: 'plain', label: 'Plain' },
  { id: 'name', label: '1 Name' },
  { id: 'glyph', label: '2 Glyph' },
  { id: 'approach', label: '3 Tag' },
  { id: 'gauge', label: '4 Gauge' }
] as const;

/** TEMPORARY: the key the trial's treatment is kept under in `localStorage`, per device. */
export const valueFaceKey = 'paint.lego.value-face-trial';

const [face, setFace] = createSignal<ValueFace>(readValueFace());

/** TEMPORARY: the treatment every one-cell value part shows now, the same across the board, its popups and the studio. */
export function valueFace() {
  return face();
}

/** TEMPORARY: shows `next` on every one-cell value part and keeps it; a refused write keeps it until the page closes. */
export function chooseValueFace(next: ValueFace) {
  setFace(next);
  try {
    localStorage.setItem(valueFaceKey, next);
  } catch {
    // Storage refused: the choice lasts for this page.
  }
}

/** TEMPORARY: the stored treatment, `plain` when none is stored or the entry cannot be read or is unknown. */
export function readValueFace(): ValueFace {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(valueFaceKey);
  } catch {
    return 'plain';
  }

  return valueFaces.find((option) => option.id === stored)?.id ?? 'plain';
}

/**
 * TEMPORARY: the developer switch beside Edit, a small button naming the treatment shown now; a tap steps to the next
 * one (see `valueFaces`) and keeps it.
 */
export function ValueFaceSwitch() {
  const index = () => valueFaces.findIndex((option) => option.id === face());

  return (
    <button
      type="button"
      class={[styles.editButton, styles.trialButton]}
      title="One-cell value trial (temporary)"
      onClick={() => chooseValueFace(valueFaces[(index() + 1) % valueFaces.length]!.id)}
    >
      {valueFaces[index()]!.label}
    </button>
  );
}

/**
 * What a one-cell value of `part` shows beside its number with the treatment `face`, decided by the room it has, never
 * by the cell size alone:
 *
 * - `name`: the short name in capitals above the number, when the two stack within the face's height and the name
 *   fits its width. A short name too wide gives way to the label's initials ("Scatter count jitter" is SCJ), and
 *   those to their first two letters; the name goes only when even two letters do not fit.
 * - `glyph`: the value's icon above the number, when the two stack within the face's height.
 * - `gauge` (a knob only): the name, chosen as for `name`, in the arc's opening, whose width is the chord the 90°
 *   opening leaves; a number look shows it under the number. With the full name on approach.
 * - `approach`: nothing in the part; the full name on approach.
 *
 * `room` is the part's box. A knob's face is the box less its arc's ring on every side; a number look's is the box
 * less its compact padding.
 */
export function oneCellFace(
  face: ValueFace,
  look: 'knob' | 'number',
  room: { width: number; height: number },
  value: { id: string; label: string; short: string }
) {
  const inset = look === 'knob' ? knobRing : numberInset;
  const width = room.width - 2 * inset;
  const height = room.height - 2 * inset;
  const stacks = (top: number, gap: number) => top + gap + numberRow <= height;
  const gauge = face === 'gauge' && look === 'knob';
  const nameRoom = gauge ? gaugeOpening * Math.min(room.width, room.height) : width;

  return {
    name:
      (face === 'name' || face === 'gauge') && stacks(nameRow, stackGap)
        ? faceName(nameRoom, value.label, value.short)
        : undefined,
    glyph: face === 'glyph' && stacks(glyphSize, 0) && glyphSize <= width ? valueGlyph(value.id) : undefined,
    /** Whether the knob's arc is a gauge with an opening at the bottom. */
    gauge,
    /** Whether the name stands under the number, as the gauge sets it, rather than above. */
    below: face === 'gauge',
    /** Whether the full name shows in a tag on approach. */
    approach: face === 'approach' || face === 'gauge'
  };
}

/** The ring of arc around a stacked knob's face, and the padding around a compact number look's field. */
const knobRing = 2;
const numberInset = 2;

/**
 * The rows a face stacks its name or glyph and its number in, in CSS pixels: a row is a little taller than its text's
 * capitals (10 px capitals stand 7 px tall, 12 px digits 9), 2 px apart, so the stack fits a 20 px face, the smallest
 * a 24 px cell has. An icon sits right on the number: its box keeps a pixel of its own clear. As `.stackFace` lays
 * them out.
 */
const nameRow = 8;
const glyphSize = 10;
const numberRow = 10;
const stackGap = 2;

/** The share of a gauge knob's edge its 90° opening spans as a chord: 2 sin 45°, half of it per side of the centre. */
const gaugeOpening = Math.SQRT1_2;

/** How a face sets the value's name, as `.faceName` does. */
export const faceNameStyle: TextStyle = { size: 10, weight: 700, letterSpacing: 0.3 };

/** The first of the short name, the label's initials and their first two letters that fits `room`, in capitals. */
function faceName(room: number, label: string, short: string) {
  const initials = nameInitials(label);
  return fitText(room, faceNameStyle, short.toUpperCase(), initials, initials.slice(0, 2));
}

/**
 * The initials of `label` in capitals, up to three: "Layer opacity" is LO, "FG/BG jitter" FBJ. A one-word label gives
 * its first two letters, "Smoothing" SM.
 */
export function nameInitials(label: string) {
  const words = label.split(/[\s/]+/).filter(Boolean);
  return (
    words.length > 1
      ? words
          .slice(0, 3)
          .map((word) => word[0])
          .join('')
      : label.slice(0, 2)
  ).toUpperCase();
}

/**
 * The icon for the value `id`: its own for size, opacity, flow, hue, saturation, brightness and lightness, smoothing
 * and layer opacity, also for the ABR brush's flow and smoothing; sliders for every other value.
 */
export function valueGlyph(id: string): SketchIconName {
  return glyphs[id] ?? 'sliders';
}

const glyphs: Readonly<Record<string, SketchIconName>> = {
  size: 'size',
  opacity: 'opacity',
  'brush:flow': 'flow',
  'brush:abr-tool-flow': 'flow',
  hue: 'hue',
  saturation: 'saturation',
  brightness: 'brightness',
  lightness: 'brightness',
  'brush:smoothing': 'smoothing',
  'brush:abr-smoothing-amount': 'smoothing',
  'layer-opacity': 'layerOpacity'
};

/** The value's icon as a face sets it above the number. */
export function FaceGlyph(props: { name: SketchIconName }) {
  return (
    <span class={styles.faceGlyph}>
      <SketchIcon name={props.name} size={glyphSize} />
    </span>
  );
}

/**
 * The name tag of the `approach` treatment: whether it shows, and the pointer handlers that show it, for the element
 * that holds a value part. It shows while a pen or mouse hovers over the part with no button down (a pen hovering
 * reports as `pen` in Chrome for Android, a finger never hovers), and from a press with any pointer, a finger too, until that pointer
 * lifts or is cancelled. A press reports itself as `pressed`, so the tag shows the value with the name meanwhile.
 * `onPointerDown` must be called from the element's own handler; the lift is heard on the window, so a part that
 * captures the pointer or goes away mid-press still hides its tag.
 */
export function createNameTag() {
  const [hovered, setHovered] = createSignal(false);
  const [press, setPress] = createSignal<number>();
  const lift = (event: PointerEvent) => {
    if (event.pointerId === press()) {
      setPress(undefined);
    }
  };
  createEventListener(() => (press() === undefined ? undefined : window), 'pointerup', lift);
  createEventListener(() => (press() === undefined ? undefined : window), 'pointercancel', lift);

  return {
    /** Whether the tag shows. */
    shown: () => hovered() || press() !== undefined,
    /** Whether a press holds the part, so the tag shows the value too. */
    pressed: () => press() !== undefined,
    onPointerDown(event: PointerEvent) {
      setPress(event.pointerId);
    },
    handlers: {
      onPointerEnter(event: PointerEvent) {
        // A press dragged across from another part is no hover: only one tag shows at a time.
        if (event.pointerType !== 'touch' && event.buttons === 0) {
          setHovered(true);
        }
      },
      onPointerLeave() {
        setHovered(false);
      }
    }
  };
}

/** A press held this long without moving only shows the name tag: lifting it opens nothing. */
export const peekHold = 450;

/**
 * The full name of a value over everything beside its part, in the browser's top layer like the keypad (see
 * `ValueEntryCard`), never taking a press: above the part where there is room, otherwise under it, centred on it and
 * kept inside the window. While the part is pressed it shows the value after the name, so a finger over the number
 * still sees it change.
 */
export function NameTag(props: { anchor: Element; label: string; value?: string }) {
  const [tag, setTag] = createSignal<HTMLElement>();

  createEffect(
    () => ({ element: tag(), text: `${props.label}${props.value ?? ''}` }),
    ({ element }) => {
      if (!element) {
        return;
      }

      try {
        if (!element.matches(':popover-open')) {
          element.showPopover?.();
        }
      } catch {
        // Popovers unsupported, as in jsdom: the tag lies in place.
      }

      placeTag(element, props.anchor);
    }
  );

  return (
    <span ref={setTag} class={styles.nameTag} popover="manual" role="status">
      {props.label}
      <Show when={props.value}>{(value) => <b>{value()}</b>}</Show>
    </span>
  );
}

function placeTag(tag: HTMLElement, anchor: Element) {
  const rect = anchor.getBoundingClientRect();
  const { width, height } = tag.getBoundingClientRect();
  const margin = 6;
  const above = rect.top - margin - height;
  const top = above >= margin ? above : rect.bottom + margin;
  const left = Math.max(margin, Math.min(window.innerWidth - margin - width, rect.left + rect.width / 2 - width / 2));
  tag.style.left = `${left}px`;
  tag.style.top = `${top}px`;
}
