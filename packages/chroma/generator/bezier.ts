import { Color } from '../color';
import type { ColorChannelInput, ColorValue } from '../types';
import { scale } from './scale';

type LabTuple = [number, number, number];
type LabReader = () => LabTuple;
type BezierFunction = ((t: number) => Color) & {
  scale: () => ReturnType<typeof scale>;
};

function readLab(color: Color): LabTuple {
  const lab = color.lab;
  if (typeof lab !== 'function') {
    throw new Error('Missing lab reader');
  }

  return (lab as LabReader).call(color);
}

function binomRow(n: number): number[] {
  let row = [1, 1];
  for (let index = 1; index < n; index += 1) {
    const nextRow = [1];
    for (let column = 1; column <= row.length; column += 1) {
      nextRow[column] = (row[column] ?? 0) + (row[column - 1] ?? 0);
    }
    row = nextRow;
  }
  return row;
}

function ensureColors(colors: readonly ColorValue[]): Color[] {
  return colors.map((color) => (color instanceof Color ? color : new Color(color)));
}

function createBezier(colors: readonly ColorValue[]): (t: number) => Color {
  const palette = ensureColors(colors);
  if (palette.length < 2) {
    throw new RangeError('No point in running bezier with only one color.');
  }

  const labs = palette.map((color) => readLab(color));
  if (labs.length === 2) {
    const [lab0, lab1] = labs;
    return (t: number) =>
      new Color(toColorChannelInput([0, 1, 2].map((index) => lab0[index] + t * (lab1[index] - lab0[index]))), 'lab');
  }

  if (labs.length === 3) {
    const [lab0, lab1, lab2] = labs;
    return (t: number) =>
      new Color(
        toColorChannelInput(
          [0, 1, 2].map(
            (index) => (1 - t) * (1 - t) * lab0[index] + 2 * (1 - t) * t * lab1[index] + t * t * lab2[index]
          )
        ),
        'lab'
      );
  }

  if (labs.length === 4) {
    const [lab0, lab1, lab2, lab3] = labs;
    return (t: number) =>
      new Color(
        toColorChannelInput(
          [0, 1, 2].map(
            (index) =>
              (1 - t) * (1 - t) * (1 - t) * lab0[index] +
              3 * (1 - t) * (1 - t) * t * lab1[index] +
              3 * (1 - t) * t * t * lab2[index] +
              t * t * t * lab3[index]
          )
        ),
        'lab'
      );
  }

  const row = binomRow(labs.length - 1);
  const degree = labs.length - 1;
  return (t: number) => {
    const u = 1 - t;
    return new Color(
      toColorChannelInput(
        [0, 1, 2].map((index) =>
          labs.reduce(
            (sum, lab, labIndex) => sum + (row[labIndex] ?? 0) * u ** (degree - labIndex) * t ** labIndex * lab[index],
            0
          )
        )
      ),
      'lab'
    );
  };
}

function toColorChannelInput(values: readonly number[]): ColorChannelInput {
  return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0];
}

/**
 * Returns a bezier interpolator in Lab space.
 *
 * The returned function accepts a value in the range 0..1. Call `.scale()` to convert it into a regular chroma scale.
 */
export function bezier(colors: readonly ColorValue[]): BezierFunction {
  const interpolate = createBezier(colors) as BezierFunction;
  interpolate.scale = () => scale(interpolate);
  return interpolate;
}
