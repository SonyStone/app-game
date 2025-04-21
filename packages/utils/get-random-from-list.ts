export function getRandomFromList(): undefined;
export function getRandomFromList(list: []): undefined;
export function getRandomFromList<T>(list: readonly T[]): T;
export function getRandomFromList<T>(list?: readonly T[]): T | undefined {
  if (!list || list.length === 0) {
    return undefined;
  }
  const randomIndex = Math.floor(Math.random() * list.length);
  return list[randomIndex];
}
