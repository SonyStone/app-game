import { parseMap, serializeMap, type ParseResult, type TankiMap } from './format';

/**
 * Maps kept in the browser's `localStorage`, one key per map name, and maps as JSON files.
 * Both hold the text of {@link serializeMap}, so a saved map is the same file either way.
 */

/** Names of the maps saved in `storage`, sorted. */
export function savedMapNames(storage: Storage = localStorage) {
  const names: string[] = [];

  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);

    if (key?.startsWith(KEY_PREFIX)) {
      names.push(key.slice(KEY_PREFIX.length));
    }
  }

  return names.sort((a, b) => a.localeCompare(b));
}

/**
 * Saves `map` under its name, replacing a map saved under the same name. Fails with a message
 * when the browser refuses, typically because its storage quota is full.
 */
export function saveMapToStorage(
  map: TankiMap,
  storage: Storage = localStorage
): { ok: true } | { ok: false; error: string } {
  try {
    storage.setItem(KEY_PREFIX + map.name, serializeMap(map));

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: `The browser refused to save the map: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/** Reads the map saved as `name`. */
export function loadMapFromStorage(name: string, storage: Storage = localStorage): ParseResult {
  const text = storage.getItem(KEY_PREFIX + name);

  return text === null ? { ok: false, error: `No map named "${name}" is saved in this browser.` } : parseMap(text);
}

/** Forgets the map saved as `name`. */
export function deleteSavedMap(name: string, storage: Storage = localStorage) {
  storage.removeItem(KEY_PREFIX + name);
}

/** Offers `map` as a download named after it, `<name>.tanki-map.json`. */
export function downloadMap(map: TankiMap) {
  const url = URL.createObjectURL(new Blob([serializeMap(map)], { type: 'application/json' }));
  const link = document.createElement('a');

  link.href = url;
  link.download = `${fileStem(map.name)}.tanki-map.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Reads a map from a file the user picked. */
export async function readMapFile(file: Blob): Promise<ParseResult> {
  try {
    return parseMap(await file.text());
  } catch (error) {
    return { ok: false, error: `Could not read the file: ${error instanceof Error ? error.message : String(error)}` };
  }
}

const KEY_PREFIX = 'tanki-map:';

/** A file name from a map name: letters, digits and dashes. */
function fileStem(name: string) {
  return (
    name
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'map'
  );
}
