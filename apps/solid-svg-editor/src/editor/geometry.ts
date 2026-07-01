export interface Matrix2D {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const identityMatrix = {
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  e: 0,
  f: 0
} satisfies Matrix2D;

export function matrix(a: number, b: number, c: number, d: number, e: number, f: number): Matrix2D {
  return { a, b, c, d, e, f };
}

export function translateMatrix(x: number, y: number): Matrix2D {
  return matrix(1, 0, 0, 1, x, y);
}

export function scaleMatrix(x: number, y: number): Matrix2D {
  return matrix(x, 0, 0, y, 0, 0);
}

export function rotateMatrix(radians: number): Matrix2D {
  return matrix(Math.cos(radians), Math.sin(radians), -Math.sin(radians), Math.cos(radians), 0, 0);
}

export function multiplyMatrices(left: Matrix2D, right: Matrix2D): Matrix2D {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f
  };
}

export function transformPoint(matrixValue: Matrix2D, point: Point): Point {
  return {
    x: matrixValue.a * point.x + matrixValue.c * point.y + matrixValue.e,
    y: matrixValue.b * point.x + matrixValue.d * point.y + matrixValue.f
  };
}

export function invertMatrix(matrixValue: Matrix2D): Matrix2D | undefined {
  const determinant = matrixValue.a * matrixValue.d - matrixValue.b * matrixValue.c;

  if (Math.abs(determinant) < 0.0000001) {
    return undefined;
  }

  return {
    a: matrixValue.d / determinant,
    b: -matrixValue.b / determinant,
    c: -matrixValue.c / determinant,
    d: matrixValue.a / determinant,
    e: (matrixValue.c * matrixValue.f - matrixValue.d * matrixValue.e) / determinant,
    f: (matrixValue.b * matrixValue.e - matrixValue.a * matrixValue.f) / determinant
  };
}

export function parseTransformList(value: string): Matrix2D {
  let result = identityMatrix;
  const transformPattern = /([a-zA-Z]+)\(([^)]*)\)/g;

  for (const match of value.matchAll(transformPattern)) {
    const [, name, body] = match;

    if (!name || body === undefined) {
      continue;
    }

    result = multiplyMatrices(result, transformFunctionToMatrix(name, parseTransformNumbers(body)));
  }

  return result;
}

export function formatMatrixTransform(matrixValue: Matrix2D): string {
  return `matrix(${formatMatrixNumber(matrixValue.a)} ${formatMatrixNumber(matrixValue.b)} ${formatMatrixNumber(matrixValue.c)} ${formatMatrixNumber(matrixValue.d)} ${formatMatrixNumber(matrixValue.e)} ${formatMatrixNumber(matrixValue.f)})`;
}

export function matrixAround(anchor: Point, transform: Matrix2D): Matrix2D {
  return multiplyMatrices(multiplyMatrices(translateMatrix(anchor.x, anchor.y), transform), translateMatrix(-anchor.x, -anchor.y));
}

export function rectFromPoints(points: readonly Point[]): Rect | undefined {
  const first = points[0];

  if (!first) {
    return undefined;
  }

  let minX = first.x;
  let minY = first.y;
  let maxX = first.x;
  let maxY = first.y;

  for (const point of points.slice(1)) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

export function rectCenter(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

export function unionRects(rects: readonly Rect[]): Rect | undefined {
  const first = rects[0];

  if (!first) {
    return undefined;
  }

  let minX = first.x;
  let minY = first.y;
  let maxX = first.x + first.width;
  let maxY = first.y + first.height;

  for (const rect of rects.slice(1)) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function parseTransformNumbers(value: string): readonly number[] {
  const matches = value.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  return matches.map((item) => Number.parseFloat(item)).filter(Number.isFinite);
}

function transformFunctionToMatrix(name: string, values: readonly number[]): Matrix2D {
  switch (name.toLowerCase()) {
    case "matrix":
      return values.length >= 6 ? matrix(values[0] ?? 1, values[1] ?? 0, values[2] ?? 0, values[3] ?? 1, values[4] ?? 0, values[5] ?? 0) : identityMatrix;
    case "translate":
      return translateMatrix(values[0] ?? 0, values[1] ?? 0);
    case "scale": {
      const sx = values[0] ?? 1;
      return scaleMatrix(sx, values[1] ?? sx);
    }
    case "rotate": {
      const rotation = rotateMatrix(degreesToRadians(values[0] ?? 0));

      if (values.length >= 3) {
        return matrixAround({ x: values[1] ?? 0, y: values[2] ?? 0 }, rotation);
      }

      return rotation;
    }
    case "skewx":
      return matrix(1, 0, Math.tan(degreesToRadians(values[0] ?? 0)), 1, 0, 0);
    case "skewy":
      return matrix(1, Math.tan(degreesToRadians(values[0] ?? 0)), 0, 1, 0, 0);
    default:
      return identityMatrix;
  }
}

function formatMatrixNumber(value: number): string {
  const rounded = Math.round(value * 1000000) / 1000000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}
