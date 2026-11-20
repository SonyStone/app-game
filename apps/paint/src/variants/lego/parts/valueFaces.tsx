import { createEventListener } from '@solid-primitives/event-listener';
import { createEffect, createSignal } from 'solid-js';
import styles from '../LegoStudio.module.css';
import { fitText, type TextStyle } from '../textFit';

/**
 * How a value part too small for a caption, a knob or a captionless number look, tells which value it is: the
 * channel's short name in small capitals above the number, and its full name with the value in a tag beside the part
 * on hover and on a press (see `createNameTag` and `NameTag`).
 *
 * The name and the number are laid out by their ink, the height of their capitals and digits, so the room left over
 * is shared out exactly: a third of it between the two lines (2 to 4 px) and the rest evenly above and below. The
 * texts never shrink. What gives way where room is short is a knob's arc: 2 px around its face where the face then
 * leaves at least 4 px above, between and below, 1.5 px below that (24 and 28 px cells).
 *
 * The name is the short name when it fits the face's width less `nameSide` each side; a short name too wide gives way
 * to the label's initials ("Scatter count jitter" is SCJ), and those to their first two letters. It goes only when
 * even two letters do not fit, or when the two lines do not stack with 2 px between them and 1 px to each edge.
 *
 * `room` is the part's box, never the cell size alone.
 */
export function oneCellFace(
  look: 'knob' | 'number',
  room: { width: number; height: number },
  value: { label: string; short: string }
) {
  const numberInk = look === 'knob' ? knobDigits : numberDigits;
  const ink = nameCaps + numberInk;
  const ring = look === 'number' ? 0 : room.height - 2 * wideRing - ink >= 3 * maxGap ? wideRing : narrowRing;
  const spare = room.height - 2 * ring - ink;
  const gap = Math.min(maxGap, Math.max(minGap, Math.round((spare / 3) * 2) / 2));
  const stacks = spare >= minGap + 2 * minMargin;

  return {
    name: stacks ? faceName(room.width - 2 * ring - 2 * nameSide, value.label, value.short) : undefined,
    /** The arc around a knob's face in CSS pixels; 0 for the number look, which has none. */
    ring,
    /** The space between the name's capitals and the number's digits in CSS pixels. */
    gap,
    /** How far the number's centre sits below the face's centre with the name above it; half the name and gap. */
    numberOffset: (nameCaps + gap) / 2,
    /** How far the name's centre sits above the face's centre; half the number and gap. */
    nameOffset: (numberInk + gap) / 2
  };
}

/**
 * The height in CSS pixels of the face's inks, as `.faceName`, `.faceNumber` and the compact number set them: 10 px
 * capitals stand 7 px, a knob's 12 px digits 9 px and a compact number look's 11 px digits 8 px. Each line's
 * line-height is its ink, which in the system fonts (San Francisco, Roboto, Segoe) puts the capitals right inside it.
 */
const nameCaps = 7;
const knobDigits = 9;
const numberDigits = 8;

/** The space between the name and the number: at least 2 px, at most 4, a third of the room left over between. */
const minGap = 2;
const maxGap = 4;

/** The least room between the inks and the face's edge for the name to show. */
const minMargin = 1;

/** A knob's arc around its face: `wideRing` where the face keeps the full spacing, `narrowRing` otherwise. */
const wideRing = 2;
const narrowRing = 1.5;

/**
 * Room kept clear between the name and either side of the face, besides the pixel `fitText` keeps spare: a third
 * initial, as in SCF, still fits a 28 px knob.
 */
const nameSide = 0.5;

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
 * Whether a one-cell value's name tag shows, and the pointer handlers that show it, for the element that holds the
 * part. It shows while a pen or mouse hovers over the part with no button down (a hovering pen reports as `pen` in
 * Chrome for Android; a finger never hovers), and from a press with any pointer, a finger too, at once on the press,
 * until that pointer lifts or is cancelled. `onPointerDown` must be called from the element's own handler; the lift is
 * heard on the window, so a part that captures the pointer or goes away mid-press still hides its tag.
 */
export function createNameTag() {
  const [hovered, setHovered] = createSignal(false);
  const [press, setPress] = createSignal<number>();
  const pressed = () => press() !== undefined;
  const lift = (event: PointerEvent) => {
    if (event.pointerId === press()) {
      setPress(undefined);
    }
  };
  createEventListener(() => (pressed() ? window : undefined), 'pointerup', lift);
  createEventListener(() => (pressed() ? window : undefined), 'pointercancel', lift);

  return {
    /** Whether the tag shows. */
    shown: () => hovered() || pressed(),
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

/** A press on a knob held this long, however still, only shows the name tag: lifting it opens nothing. */
export const peekHold = 450;

/**
 * A value's full name and its current value, as the part formats it with its unit (a dash for a value that does not
 * apply), over everything beside its part in the browser's top layer like the keypad (see `ValueEntryCard`), so it
 * shows above the brush studio's modal dialog too. It never takes a press. It stands above the part, clear of the pen
 * or hand on it, or under it where there is no room above, centred on it and kept inside the window, and follows the
 * part every frame while it shows, as on a floating plate being moved.
 */
export function NameTag(props: { anchor: Element; label: string; value: string }) {
  const [tag, setTag] = createSignal<HTMLElement>();

  createEffect(tag, (element) => {
    if (!element) {
      return;
    }

    try {
      element.showPopover?.();
    } catch {
      // Popovers unsupported, as in jsdom: the tag lies in place.
    }

    // `@solid-primitives/raf` is no dependency of the app, and the loop is this one line.
    let frame = 0;
    const follow = () => {
      placeTag(element, props.anchor);
      frame = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(frame);
  });

  return (
    <span ref={setTag} class={styles.nameTag} popover="manual" role="status">
      {props.label}
      <b>{props.value}</b>
    </span>
  );
}

/** Puts `tag` above `anchor`, or under it without room above, centred on it and inside the window. */
function placeTag(tag: HTMLElement, anchor: Element) {
  const rect = anchor.getBoundingClientRect();
  const { width, height } = tag.getBoundingClientRect();
  const above = rect.top - tagMargin - height;
  const below = rect.bottom + tagMargin;
  const top = above >= tagMargin ? above : Math.min(below, window.innerHeight - tagMargin - height);
  const left = Math.max(
    tagMargin,
    Math.min(window.innerWidth - tagMargin - width, rect.left + rect.width / 2 - width / 2)
  );
  // Unchanged positions are not written again, so a still tag costs a frame no style change.
  if (tag.style.left !== `${left}px` || tag.style.top !== `${top}px`) {
    tag.style.left = `${left}px`;
    tag.style.top = `${top}px`;
  }
}

/** The space between the tag and its part, and between the tag and the window's edge. */
const tagMargin = 6;
