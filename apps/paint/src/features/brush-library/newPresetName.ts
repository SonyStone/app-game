/**
 * A name for a new brush made from the one named `name`, unlike every name in `taken`: the name's stem with the next
 * free number after it, so "Soft round" gives "Soft round 2" and "Soft round 2" gives "Soft round 3", skipping numbers
 * already taken. A name ending in a number counts from that number; any other name from 2.
 */
export function newPresetName(name: string, taken: Iterable<string>) {
  const names = new Set(taken);
  const numbered = /^(.*\S)\s+(\d+)$/.exec(name.trim());
  const stem = numbered ? numbered[1]! : name.trim();
  let number = numbered ? Number(numbered[2]) + 1 : 2;
  while (names.has(`${stem} ${number}`)) {
    number++;
  }

  return `${stem} ${number}`;
}
