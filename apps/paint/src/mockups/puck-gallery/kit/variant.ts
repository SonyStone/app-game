import type { Component } from 'solid-js';
import type { Point } from './createSketchCanvas';
import type { Studio } from './createStudio';

/**
 * The contract between the gallery and a Puck-and-cluster variant. The gallery owns the drawing, the stage input
 * (painting, finger navigation, the wheel) and the ways to summon a variant; a variant owns everything it shows.
 *
 * Summoning, the same in every variant so that they compare fairly:
 *
 * | Input    | Opens                                                                    |
 * |----------|--------------------------------------------------------------------------|
 * | Keyboard | Space, while held (`mode: 'hold'`)                                        |
 * | Pen      | the side button, as a toggle (`mode: 'toggle'`)                           |
 * | Mouse    | the right button, as a toggle                                            |
 * | Finger   | a long press on the drawing (450 ms without moving), as a toggle          |
 * | Gallery  | switching to the variant, or Pin, which keeps it open (`mode: 'pinned'`) |
 *
 * A toggled variant closes on Escape, on another toggle, and on a press on the drawing outside it (which then draws
 * nothing; a finger's press still navigates). A held one closes when Space lifts; presses outside it draw, while
 * `hidden` hides it. Variants may add their own entry points, such as an on-screen handle, through `open`.
 */
export type VariantProps = {
  studio: Studio;
  /** The open request, or `undefined` while the variant is closed. A new `serial` means a new opening. */
  summon: Summon | undefined;
  /**
   * Where the pen or the mouse last was, hovering or pressing, in client pixels. Changes on every move, so read it
   * only where following the pointer is the point.
   */
  pointer: Point;
  /** The hand that holds the pen; layouts may put tools on its side and mirror for the other hand. */
  hand: 'left' | 'right';
  /** True while the variant must be invisible: a press outside a held variant is drawing through it. */
  hidden: boolean;
  /** Closes the variant, whatever its mode. */
  close: () => void;
  /**
   * Reports a finished action, such as a chosen tool, color or preset: a toggled variant closes; held and pinned
   * ones stay. Continuous actions (navigating, scrubbing a value) report it when they end.
   */
  done: () => void;
  /** Opens the variant as a toggle at `at`, for a variant's own on-screen entry point. */
  open: (at: Point, pointerType: Summon['pointerType']) => void;
  /**
   * Sets what lifting Space does to the held variant, for menus that confirm on release (a pie menu runs the item
   * it points at). Return `true` to keep the variant open as a toggle; otherwise it closes. Registered once, for the
   * variant's lifetime.
   */
  onHoldRelease: (handler: () => boolean | void) => void;
};

/** How and where the variant was opened. */
export type Summon = {
  serial: number;
  /** Where the pointer was when it opened, in client pixels; the window's center for gallery openings. */
  at: Point;
  mode: 'hold' | 'toggle' | 'pinned';
  source: 'space' | 'pen-button' | 'right-click' | 'long-press' | 'gallery' | 'variant';
  /** The input that opened it, so that a variant can size targets for fingers or skip hover effects. */
  pointerType: 'mouse' | 'pen' | 'touch' | 'keyboard';
  /**
   * The pointer whose press opened the variant and is still down: the right button, the pen's side button pressed
   * while touching, or a finger's long press. Menus may follow it on the window (`pointermove`, `pointerup` with this
   * `pointerId`) for press-drag-release selection, as marking menus do; a release without a move leaves the variant
   * open as a toggle.
   *
   * The field stays set after that press lifts, and the mouse and the pen reuse one `pointerId` for every later press,
   * so stop following it at its first `pointerup` (remember that it lifted for this `serial`).
   */
  heldPointer?: number;
};

/** A variant as the gallery lists it. */
export type VariantInfo = {
  id: string;
  /** One or two words, such as "Pie". */
  name: string;
  /** The programs or devices it borrows from. */
  inspiredBy: string;
  /** The idea in one or two sentences. */
  idea: string;
  /** How to use it, one line per input: pen, finger, mouse, keyboard. */
  howTo: { pen: string; touch: string; mouse: string; keys: string };
  component: Component<VariantProps>;
};

/**
 * Marks an element as the variant's UI: presses on it are not painting, and they do not close a toggled variant.
 * Spread it on every element that takes presses: `<div {...galleryUi}>`.
 */
export const galleryUi = { 'data-gallery-ui': '' } as const;
