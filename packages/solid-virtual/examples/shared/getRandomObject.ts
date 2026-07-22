/** Creates variable-sized example data for dynamic-height measurement. */
export function getRandomObject(): Record<string, string> {
  const obj: Record<string, string> = {};
  const propertyCount = Math.floor(Math.random() * 14) + 3;
  for (let i = 0; i < propertyCount; i++) {
    obj[`key${i}`] = `value${i}`;
  }
  return obj;
}
