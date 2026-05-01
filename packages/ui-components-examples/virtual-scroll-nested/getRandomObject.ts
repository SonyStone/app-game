import { randomIntInRange } from '@packages/utils/randomIntInrange';

export function getRandomObject() {
  const obj: Record<string, string> = {};
  for (let i = 0; i < randomIntInRange(1, 500); i++) {
    obj[`key${i}`] = `value${i}`;
  }
  return obj;
}
