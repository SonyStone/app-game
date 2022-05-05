let nextNameId = 0;

export function getNameId() {
  return `lil-gui-name-${++nextNameId}`;
}
