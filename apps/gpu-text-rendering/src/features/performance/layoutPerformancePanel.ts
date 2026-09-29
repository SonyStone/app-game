import { frameCost, summarizeFrameCosts, type FrameCostSample } from './makeFrameCostHistory';

/**
 * Lays out the performance panel in the canvas's top-left corner as solid and glyph quads in clip space, snapped to
 * device pixels. Only the last `historyLength` samples appear. The headline shows the latest frame's cost with their
 * range; the second line shows the frame rate of back-to-back frames, or IDLE, beside the legend; bars stack each
 * frame's CPU and GPU milliseconds, newest on the right, over a line at the 60 Hz budget. Costs above twice the budget
 * are clipped.
 */
export function layoutPerformancePanel(
  samples: readonly FrameCostSample[],
  /** Whether the loop has stopped drawing, so no frame rate applies. */
  idle: boolean,
  /** Canvas size in device pixels and the device pixel ratio. */
  size: { pixels: { width: number; height: number }; dpr: number }
): PanelQuad[] {
  const { width, height } = size.pixels;
  const scale = (css: number) => Math.round(css * size.dpr);
  const quads: PanelQuad[] = [];

  /** Adds a quad given in CSS pixels from the panel's origin. */
  function add(x: number, y: number, w: number, h: number, color: Rgba, glyph = -1) {
    const left = scale(margin + x);
    const top = scale(margin + y);
    const right = left + Math.max(1, scale(w));
    const bottom = top + Math.max(1, scale(h));

    quads.push({
      rect: [(left / width) * 2 - 1, 1 - (top / height) * 2, (right / width) * 2 - 1, 1 - (bottom / height) * 2],
      color,
      glyph
    });
  }

  /** Adds a line of text; characters without a glyph leave a gap. */
  function text(x: number, y: number, value: string, color: Rgba) {
    [...value].forEach((character, index) => {
      const glyph = glyphIndex.get(character);

      if (glyph !== undefined) {
        add(x + index * advance, y, glyphColumns * pixel, glyphRows * pixel, color, glyph);
      }
    });
  }

  const shown = samples.slice(-historyLength);
  const { latestMs, minMs, maxMs, fps } = summarizeFrameCosts(shown);
  const graphTop = padding + 2 * lineHeight;
  const graphWidth = historyLength * barWidth;

  add(0, 0, graphWidth + 2 * padding, graphTop + graphHeight + padding, panelColor);
  text(
    padding,
    padding,
    latestMs === undefined ? '-- MS' : `${milliseconds(latestMs)} MS (${milliseconds(minMs!)}-${milliseconds(maxMs!)})`,
    cpuColor
  );
  text(
    padding,
    padding + lineHeight,
    idle ? 'IDLE' : fps === undefined ? '-- FPS' : `${Math.round(fps)} FPS`,
    cpuColor
  );

  // Legend cells: a swatch, its label, a gap, then the second swatch and label, right-aligned with the graph.
  const legendX = padding + graphWidth - 9 * advance + pixel;
  add(legendX, padding + lineHeight, glyphColumns * pixel, glyphRows * pixel, cpuColor);
  text(legendX + advance, padding + lineHeight, 'CPU', cpuColor);
  add(legendX + 5 * advance, padding + lineHeight, glyphColumns * pixel, glyphRows * pixel, gpuColor);
  text(legendX + 6 * advance, padding + lineHeight, 'GPU', gpuColor);

  add(padding, graphTop, graphWidth, graphHeight, graphColor);

  const barHeight = (ms: number) => (Math.min(ms, graphMs) / graphMs) * graphHeight;
  const firstBar = padding + (historyLength - shown.length) * barWidth;

  shown.forEach((sample, index) => {
    const x = firstBar + index * barWidth;
    const cpu = barHeight(sample.cpuMs);
    const total = barHeight(frameCost(sample));
    const bottom = graphTop + graphHeight;

    add(x, bottom - cpu, barWidth - 1, cpu, cpuColor);

    if (total > cpu) {
      add(x, bottom - total, barWidth - 1, total - cpu, gpuColor);
    }
  });

  add(padding, graphTop + graphHeight - barHeight(budgetMs), graphWidth, 1 / size.dpr, budgetColor);

  return quads;
}

/** A panel rectangle; `glyph` selects a pixel-font glyph that masks it, or -1 for a solid fill. */
export type PanelQuad = {
  /** Left, top, right and bottom in clip space. */
  rect: readonly [number, number, number, number];
  /** Straight RGBA components in the range 0–1. */
  color: Rgba;
  glyph: number;
};

type Rgba = readonly [number, number, number, number];

/** Frames the graph shows and its headline summarizes; older samples are ignored. */
export const historyLength = 80;

/**
 * 5×7 pixel font, one string per row, top first; `#` marks a lit pixel. Covers the panel's text: digits, units,
 * punctuation and legend labels.
 */
const glyphs: Record<string, readonly string[]> = {
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['###..', '#..#.', '#...#', '#...#', '#...#', '#..#.', '###..'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.']
};

export const glyphColumns = 5;
export const glyphRows = 7;

/** Glyph rows as bit masks, glyph after glyph, with the leftmost column in bit 4, for the shader's font buffer. */
export const fontRows = Object.values(glyphs).flatMap((rows) =>
  rows.map((row) => [...row].reduce((bits, cell) => (bits << 1) | (cell === '#' ? 1 : 0), 0))
);

const glyphIndex = new Map(Object.keys(glyphs).map((character, index) => [character, index]));

/** Formats milliseconds with one decimal below 100 and none above, keeping the headline within the panel. */
function milliseconds(ms: number) {
  return ms < 100 ? ms.toFixed(1) : String(Math.round(ms));
}

// Layout in CSS pixels; text is drawn at `pixel` CSS pixels per font pixel.
const margin = 8;
const padding = 6;
const pixel = 2;
const advance = (glyphColumns + 1) * pixel;
const lineHeight = (glyphRows + 3) * pixel;
const barWidth = 3;
const graphHeight = 48;

/** The graph's full height, twice the 60 Hz frame budget. */
const graphMs = 1000 / 30;
const budgetMs = 1000 / 60;

const panelColor: Rgba = [0.04, 0.05, 0.16, 0.88];
const graphColor: Rgba = [1, 1, 1, 0.06];
const cpuColor: Rgba = [0.21, 0.94, 0.94, 1];
const gpuColor: Rgba = [0.94, 0.66, 0.25, 1];
const budgetColor: Rgba = [1, 1, 1, 0.4];
