export type Vector2 = [number, number];

export function fromAngle(angle: number): Vector2 {
  return [Math.cos(angle), Math.sin(angle)];
}

export function angleTo(vector1: Vector2, vector2: Vector2): number {
  return Math.atan2(vector1[1] - vector2[1], vector1[0] - vector2[0]);
}

export function clone(vector: Vector2 = [0, 0]): Vector2 {
  return [vector[0], vector[1]];
}

export function mag(vector: Vector2): number {
  return Math.sqrt(vector[0] * vector[0] + vector[1] * vector[1]);
}

export function dist(vector1: Vector2, vector2: Vector2): number {
  return Math.sqrt(
    Math.pow(vector1[0] - vector2[0], 2) + Math.pow(vector1[1] - vector2[1], 2)
  );
}

export function normalize(vector: Vector2): Vector2 {
  return divBy(vector, mag(vector));
}

export function limit(vector: Vector2, scalar: number): Vector2 {
  if (magSq(vector) > scalar * scalar) {
    multBy(normalize(vector), scalar);
  }
  return vector;
}

export function setMag(vector: Vector2, scalar: number): Vector2 {
  return multBy(normalize(vector), scalar);
}

export function heading(vector: Vector2): number {
  return Math.atan2(vector[1], vector[0]);
}

export function dot(point1: Vector2, point2: Vector2): number {
  return point1[0] * point2[0] + point1[1] * point1[1];
}

export function sum(vector1: Vector2, vector2: Vector2): Vector2 {
  return [vector1[0] + vector2[0], vector1[1] + vector2[1]];
}

export function add(vector1: Vector2, vector2: Vector2): Vector2 {
  return [(vector1[0] += vector2[0]), (vector1[1] += vector2[1])];
}

export function addMut(vector1: Vector2, vector2: Vector2): Vector2 {
  vector1[0] += vector2[0];
  vector1[1] += vector2[1];
  return vector1;
}

export function addBy(vector1: Vector2, value: number): Vector2 {
  vector1[0] += value;
  vector1[1] += value;
  return vector1;
}

export function sub(vector1: Vector2, vector2: Vector2): Vector2 {
  return [vector1[0] - vector2[0], vector1[1] - vector2[1]];
}

export function subMut(vector1: Vector2, vector2: Vector2): Vector2 {
  vector1[0] -= vector2[0];
  vector1[1] -= vector2[1];
  return vector1;
}

export function subBy(vector1: Vector2, value: number): Vector2 {
  vector1[0] -= value;
  vector1[1] -= value;
  return vector1;
}

export function mult(vector1: Vector2, vector2: Vector2): Vector2 {
  return [vector1[0] * vector2[0], vector1[1] * vector2[1]];
}

export function multMut(vector1: Vector2, vector2: Vector2): Vector2 {
  vector1[0] *= vector2[0];
  vector1[1] *= vector2[1];
  return vector1;
}

export function multBy(vector1: Vector2, value: number): Vector2 {
  vector1[0] *= value;
  vector1[1] *= value;
  return vector1;
}

export function div(vector1: Vector2, vector2: Vector2): Vector2 {
  return [vector1[0] / vector2[0], vector1[1] / vector2[1]];
}

export function divMut(vector1: Vector2, vector2: Vector2): Vector2 {
  vector1[0] /= vector2[0];
  vector1[1] /= vector2[1];
  return vector1;
}

export function divBy(vector1: Vector2, value: number): Vector2 {
  vector1[0] /= value;
  vector1[1] /= value;
  return vector1;
}

export function invert(vector: Vector2): Vector2 {
  return [-vector[0], -vector[1]];
}

export function invertMut(vector: Vector2): Vector2 {
  vector[0] = -vector[0];
  vector[1] = -vector[1];
  return vector;
}

export function magSq(vector: Vector2): number {
  return vector[0] * vector[0] + vector[1] * vector[1];
}

export function rotate(vector: Vector2, angle: number): Vector2 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  vector[0] = vector[0] * cos - vector[1] * sin;
  vector[1] = vector[0] * sin + vector[1] * cos;

  return vector;
}

export function lerp(
  vectorA: Vector2,
  vectorB: Vector2,
  amount: number
): Vector2 {
  if (amount > 1) {
    amount = 1;
  }
  if (amount < 0) {
    amount = 0;
  }
  return addMut(multBy(vectorA, amount), multBy(clone(vectorB), 1 - amount));
}

export function isLessOrEqual(vectorA: Vector2, vectorB: Vector2) {
  return vectorA[0] <= vectorB[0] && vectorA[1] <= vectorB[1];
}

export function isGreaterOrEqual(vectorA: Vector2, vectorB: Vector2) {
  return vectorA[0] >= vectorB[0] && vectorA[1] >= vectorB[1];
}

export function isLess(vectorA: Vector2, vectorB: Vector2) {
  return vectorA[0] < vectorB[0] && vectorA[1] < vectorB[1];
}

export function isGreater(vectorA: Vector2, vectorB: Vector2) {
  return vectorA[0] > vectorB[0] && vectorA[1] > vectorB[1];
}

export function getScalar(vector: Vector2): number {
  return vector[0] > vector[1] ? vector[0] : vector[1];
}

export function smaller(vectorA: Vector2, vectorB: Vector2) {
  return [
    vectorA[0] < vectorB[0] ? vectorA[0] : vectorB[0],
    vectorA[1] < vectorB[1] ? vectorA[1] : vectorB[1],
  ];
}

export function larger(vectorA: Vector2, vectorB: Vector2) {
  return [
    vectorA[0] > vectorB[0] ? vectorA[0] : vectorB[0],
    vectorA[1] > vectorB[1] ? vectorA[1] : vectorB[1],
  ];
}

export function small(vector: Vector2) {
  return vector[0] > vector[1]
    ? [vector[0], vector[0]]
    : [vector[1], vector[1]];
}

export function set(vectorA: Vector2, vectorB: Vector2): Vector2 {
  vectorA[0] = vectorB[0];
  vectorA[1] = vectorB[1];

  return vectorA;
}

export function copy(vectorA: Vector2, vectorB: Vector2): Vector2 {
  return set(vectorA, vectorB);
}

export function zero(vector: Vector2): Vector2 {
  vector[0] = 0;
  vector[1] = 0;

  return vector;
}

export function setX(vector: Vector2, x: number): Vector2 {
  vector[0] = x;
  return vector;
}

export function setY(vector: Vector2, y: number): Vector2 {
  vector[1] = y;
  return vector;
}

export function getX(vector: Vector2): number {
  return vector[0];
}

export function getY(vector: Vector2): number {
  return vector[1];
}

export function pointToCSSSString(point: Vector2): string {
  return `point(${point[0]}, ${point[1]})`;
}
