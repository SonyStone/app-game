export function merge<T, U>(first: T, second: U): T & U {
  const result: any = {};
  for (const id in first) {
    if (Object.prototype.hasOwnProperty.call(first, id)) {
      result[id] = first[id];
    }
  }
  for (const id in second) {
    if (!Object.prototype.hasOwnProperty.call(result, id)) {
      result[id] = second[id];
    }
  }
  return result as T & U;
}
