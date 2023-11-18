export const fillArray = <T>(length: number) => {
  const arr = [];
  for (let i = 0; i < length; i++) {
    arr.push([] as T[]);
  }
  return arr;
};
