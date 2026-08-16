import type { ExplorerTransientWindowStatus } from '../../explorer/model';

/** Session-only visual state applied to saved windows during the current browser run. */
export type SavedWindowMarker = ExplorerTransientWindowStatus;

/** Storage key for saved-window markers that intentionally disappear when the browser exits. */
export const SAVED_WINDOW_MARKERS_STORAGE_KEY = 'browserAtlas.savedWindowMarkers.v1';

/** Reads valid saved-window markers from Chrome's session-scoped extension storage. */
export async function loadSavedWindowMarkers(
  chromeApi: typeof chrome
): Promise<Map<string, SavedWindowMarker>> {
  const stored = await chromeApi.storage.session.get(SAVED_WINDOW_MARKERS_STORAGE_KEY);
  return new Map(parseSavedWindowMarkers(stored[SAVED_WINDOW_MARKERS_STORAGE_KEY]));
}

/** Adds or replaces session-only markers for persistent saved-window IDs. */
export async function markSavedWindows(
  chromeApi: typeof chrome,
  markers: Readonly<Record<string, SavedWindowMarker>>
): Promise<void> {
  const current = await loadSavedWindowMarkers(chromeApi);
  for (const [id, marker] of Object.entries(markers)) {
    current.set(id, marker);
  }
  await chromeApi.storage.session.set({
    [SAVED_WINDOW_MARKERS_STORAGE_KEY]: Object.fromEntries(current)
  });
}

function parseSavedWindowMarkers(value: unknown): readonly [string, SavedWindowMarker][] {
  if (!isRecord(value)) {
    return [];
  }
  return Object.entries(value).flatMap(([id, marker]): readonly [string, SavedWindowMarker][] =>
    marker === 'recently-saved' || marker === 'crash-recovered' ? [[id, marker]] : []
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
