export const getRandomValueFromList = <T>(list: T[]): T | undefined => {
  if (!list || list.length === 0) {
    return undefined;
  }
  const randomIndex = Math.floor(Math.random() * list.length);
  return list[randomIndex];
};
