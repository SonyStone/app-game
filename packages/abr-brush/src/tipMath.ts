/** Retains product/addition errors to reproduce the scan routine's double FMA. */
export function multiplyAdd(a: number, b: number, c: number): number {
  const splitA = 134217729 * a, splitB = 134217729 * b;
  const highA = splitA - (splitA - a), highB = splitB - (splitB - b);
  const lowA = a - highA, lowB = b - highB;
  const product = a * b;
  const productError = ((highA * highB - product) + highA * lowB + lowA * highB) + lowA * lowB;
  const sum = product + c;
  const part = sum - product;
  const sumError = (product - (sum - part)) + (c - part);
  return sum + (productError + sumError);
}
