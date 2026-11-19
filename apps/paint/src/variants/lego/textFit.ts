/**
 * Captions decided by the room they really have. A part's caption shows in full when its text fits the room the part
 * leaves it, its short form when only that fits, and nothing otherwise: it is never cut off, never overflows and never
 * shrinks, whatever the cell size. Text is measured in the editor's own type with the browser's text measurement,
 * which lays text out with the same fonts as the page, so a decision is exact for the device's fonts.
 */

/** The editor's font family, as `.editor` in `LegoStudio.module.css` sets it. */
export const legoFontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

/** The family of the editor's monospaced text, as the swatch's hex. */
export const legoMonoFamily = 'ui-monospace, monospace';

/**
 * How a caption is set: its size and weight in CSS pixels and units, the letter spacing its CSS adds after every
 * character, its family (the editor's by default), and whether its digits are tabular, as a value chip's are.
 */
export type TextStyle = {
  size: number;
  weight?: number;
  letterSpacing?: number;
  family?: string;
  tabular?: boolean;
};

/** The width of `text` set in `style`, in CSS pixels. */
export function textWidth(text: string, style: TextStyle) {
  // Tabular digits all take the width of a zero.
  const shown = style.tabular ? text.replace(/[0-9]/g, '0') : text;
  return measure(shown, style) + (style.letterSpacing ?? 0) * [...shown].length;
}

/**
 * The first of `candidates` that fits `room` CSS pixels set in `style`, or `undefined` when none does. Empty and
 * missing candidates are skipped. A pixel is kept spare, so subpixel layout never cuts a caption that measured as
 * fitting.
 */
export function fitText(room: number, style: TextStyle, ...candidates: (string | undefined)[]) {
  return candidates.find((text) => text !== undefined && text !== '' && fits(text, style, room));
}

/** Whether `text` set in `style` fits `room` CSS pixels on one line. */
export function fits(text: string, style: TextStyle, room: number) {
  return textWidth(text, style) + spare <= room;
}

/**
 * Whether `text` set in `style` wraps into at most `lines` lines of `room` CSS pixels, breaking only between words
 * as the browser does, and no word wider than a line.
 */
export function fitsLines(text: string, style: TextStyle, room: number, lines: number) {
  if (lines < 1) {
    return false;
  }

  let used = 1;
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (!fits(word, style, room)) {
      return false;
    }

    const joined = line ? `${line} ${word}` : word;
    if (fits(joined, style, room)) {
      line = joined;
    } else {
      used += 1;
      line = word;
    }
  }

  return used <= lines;
}

/** The widest of `texts` set in `style`, in CSS pixels; 0 for none. */
export function widestText(texts: readonly string[], style: TextStyle) {
  return Math.max(0, ...texts.map((text) => textWidth(text, style)));
}

/** CSS pixels a fitting caption keeps spare. */
const spare = 1;

const widths = new Map<string, number>();
let context: OffscreenCanvasRenderingContext2D | null | undefined;

/** The advance width of `text` in `style`, cached; estimated where the environment cannot measure text. */
function measure(text: string, style: TextStyle) {
  const font = `${style.weight ?? 400} ${style.size}px ${style.family ?? legoFontFamily}`;
  const key = `${font}\u0000${text}`;
  const known = widths.get(key);
  if (known !== undefined) {
    return known;
  }

  context ??= typeof OffscreenCanvas === 'undefined' ? null : new OffscreenCanvas(1, 1).getContext('2d');
  let width: number;
  if (context) {
    context.font = font;
    width = context.measureText(text).width;
  } else {
    width = estimate(text, style);
  }

  widths.set(key, width);
  return width;
}

/**
 * An estimate for environments without text measurement, such as the tests' DOM: Helvetica's advance widths, widened
 * to the system UI font's (San Francisco sets 7% wider at regular weight and 13% at semibold), and an even width for a
 * monospaced family.
 */
function estimate(text: string, style: TextStyle) {
  if (style.family === legoMonoFamily) {
    return [...text].length * style.size * 0.6;
  }

  const widen = (style.weight ?? 400) >= 600 ? 1.13 : 1.07;
  const units = [...text].reduce((sum, character) => sum + (helvetica[character] ?? 600), 0);
  return (units / 1000) * style.size * widen;
}

/** Helvetica's advance widths in thousandths of an em, by character. */
const helvetica: Readonly<Record<string, number>> = Object.fromEntries(
  (
    [
      [' !', 278],
      ['"', 355],
      ['#$0123456789?_', 556],
      ['%', 889],
      ['&ABEKPSVXY', 667],
      ["'", 191],
      ['()-`r', 333],
      ['*', 389],
      ['+<=>~', 584],
      [',./:;I[\\]ft', 278],
      ['ijl', 222],
      ['@', 1015],
      ['CDHNRUw', 722],
      ['FTZ', 611],
      ['GOQ', 778],
      ['J', 500],
      ['L', 556],
      ['Mm', 833],
      ['W', 944],
      ['^', 469],
      ['abdeghnopqu', 556],
      ['ckvsxyz', 500],
      ['{}', 334],
      ['|', 260]
    ] as const
  ).flatMap(([characters, width]) => [...characters].map((character) => [character, width]))
);
