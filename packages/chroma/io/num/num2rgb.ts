export function num2rgb(num: number): [number, number, number, number] {
  if (typeof num === 'number' && num >= 0 && num <= 0xffffff) {
    return [num >> 16, (num >> 8) & 0xff, num & 0xff, 1];
  }

  throw new Error(`unknown num color: ${num}`);
}
