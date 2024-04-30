export function validate<T extends number[]>(values: T): T {
  for (let i = 0; i < values.length; i++) {
    if (isNaN(values[i])) {
      values[i] = 0;
    }
    if (values[i] === Infinity) {
      values[i] = Number.MAX_VALUE;
    }
    if (values[i] === -Infinity) {
      values[i] = -Number.MAX_VALUE;
    }
  }

  return values;
}
