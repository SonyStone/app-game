const bigNum = 1e20;
const round = (value: number) =>
  ~~(value * 1000 + (value < 0 ? -0.5 : 0.5)) / 1000;
const bonusValidated = 1; //<name>CustomEase</name>
/**
 * finds any numbers, including ones that start with += or -=, negative numbers, and ones in scientific notation like 1e-8.
 */
const numExp = /[-+=\.]*\d+[\.e\-\+]*\d*[e\-\+]*\d*/gi;
const needsParsingExp = /[cLlsSaAhHvVtTqQ]/g;
const findMinimum = (values: number[]) => {
  let l = values.length,
    min = bigNum,
    i;
  for (i = 1; i < l; i += 6) {
    +values[i] < min && (min = +values[i]);
  }
  return min;
};

/**
 * takes all the points and translates/scales them so that the x starts at 0 and ends at 1.
 */
const normalize = (values: number[], height: number, originY: number) => {
  if (!originY && originY !== 0) {
    originY = Math.max(+values[values.length - 1], +values[1]);
  }

  let tx = +values[0] * -1;
  let ty = -originY;
  let l = values.length;
  let sx = 1 / (+values[l - 2] + tx);
  let sy =
    -height ||
    (Math.abs(+values[l - 1] - +values[1]) <
    0.01 * (+values[l - 2] - +values[0])
      ? findMinimum(values) + ty
      : +values[l - 1] + ty);
  let i;
  if (sy) {
    //typically y ends at 1 (so that the end values are reached)
    sy = 1 / sy;
  } else {
    //in case the ease returns to its beginning value, scale everything proportionally
    sy = -sx;
  }
  for (i = 0; i < l; i += 2) {
    values[i] = (+values[i] + tx) * sx;
    values[i + 1] = (+values[i + 1] + ty) * sy;
  }
};

/**
 * note that this function returns point objects like {x, y} rather than working with segments which are arrays with alternating x, y values as in the similar function in paths.js
 */
export const bezierToPoints = function (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  x4: number,
  y4: number,
  threshold: number,
  points: { x: number; y: number }[],
  index: number
) {
  const x12 = (x1 + x2) / 2;
  const y12 = (y1 + y2) / 2;
  const x23 = (x2 + x3) / 2;
  const y23 = (y2 + y3) / 2;
  const x34 = (x3 + x4) / 2;
  const y34 = (y3 + y4) / 2;
  const x123 = (x12 + x23) / 2;
  const y123 = (y12 + y23) / 2;
  const x234 = (x23 + x34) / 2;
  const y234 = (y23 + y34) / 2;
  const x1234 = (x123 + x234) / 2;
  const y1234 = (y123 + y234) / 2;
  const dx = x4 - x1;
  const dy = y4 - y1;
  const d2 = Math.abs((x2 - x4) * dy - (y2 - y4) * dx);
  const d3 = Math.abs((x3 - x4) * dy - (y3 - y4) * dx);
  let length;

  if (!points) {
    points = [
      { x: x1, y: y1 },
      { x: x4, y: y4 },
    ];
    index = 1;
  }
  points.splice(index || points.length - 1, 0, { x: x1234, y: y1234 });

  if ((d2 + d3) * (d2 + d3) > threshold * (dx * dx + dy * dy)) {
    length = points.length;

    bezierToPoints(
      x1,
      y1,
      x12,
      y12,
      x123,
      y123,
      x1234,
      y1234,
      threshold,
      points,
      index
    );

    bezierToPoints(
      x1234,
      y1234,
      x234,
      y234,
      x34,
      y34,
      x4,
      y4,
      threshold,
      points,
      index + 1 + (points.length - length)
    );
  }

  return points;
};
