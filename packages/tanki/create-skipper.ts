export function createSkipper(howMuchToSkip: number) {
  let skip = 0;

  return {
    skip(): boolean {
      if (skip <= 0) {
        skip = howMuchToSkip;
        return false;
      } else {
        skip--;
        return true;
      }
    }
  };
}
