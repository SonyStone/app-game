export function limit(x: number, min = 0, max = 1): number {
  return x < min ? min : x > max ? max : x;
}
