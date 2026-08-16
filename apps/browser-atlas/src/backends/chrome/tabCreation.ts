const INTERNAL_TAB_CREATION_KEY_PREFIX = 'browserAtlas.internalTabCreation.';
const INTERNAL_TAB_CREATION_TTL_MS = 10_000;

/** Creates a tab while marking its onCreated event as an internal Browser Atlas operation. */
export async function createInternalChromeTab(
  chromeApi: typeof chrome,
  properties: Parameters<typeof chromeApi.tabs.create>[0]
): Promise<chrome.tabs.Tab> {
  const token = crypto.randomUUID();
  const storageKey = `${INTERNAL_TAB_CREATION_KEY_PREFIX}${token}`;
  await chromeApi.storage.local.set({
    [storageKey]: {
      url: typeof properties.url === 'string' ? properties.url : null,
      windowId: properties.windowId ?? null,
      expiresAt: Date.now() + INTERNAL_TAB_CREATION_TTL_MS
    } satisfies InternalTabCreationMarker
  });
  try {
    return await chromeApi.tabs.create(properties);
  } catch (cause: unknown) {
    await chromeApi.storage.local.remove(storageKey);
    throw cause;
  }
}

/** Consumes a pending marker when a tab was created by Browser Atlas rather than normal browsing. */
export async function consumeInternalChromeTabCreation(
  chromeApi: typeof chrome,
  tab: chrome.tabs.Tab
): Promise<boolean> {
  const storage = await chromeApi.storage.local.get(null);
  const now = Date.now();
  const staleKeys: string[] = [];
  let matchedKey: string | undefined;
  for (const [storageKey, value] of Object.entries(storage)) {
    if (!storageKey.startsWith(INTERNAL_TAB_CREATION_KEY_PREFIX) || !isInternalTabCreationMarker(value)) {
      continue;
    }
    if (value.expiresAt < now) {
      staleKeys.push(storageKey);
      continue;
    }
    if (matchedKey === undefined && matchesMarker(value, tab)) {
      matchedKey = storageKey;
    }
  }
  await chromeApi.storage.local.remove([...staleKeys, ...(matchedKey ? [matchedKey] : [])]);
  return matchedKey !== undefined;
}

type InternalTabCreationMarker = Readonly<{
  url: string | null;
  windowId: number | null;
  expiresAt: number;
}>;

function isInternalTabCreationMarker(value: unknown): value is InternalTabCreationMarker {
  return (
    typeof value === 'object' &&
    value !== null &&
    'url' in value &&
    (typeof value.url === 'string' || value.url === null) &&
    'windowId' in value &&
    (typeof value.windowId === 'number' || value.windowId === null) &&
    'expiresAt' in value &&
    typeof value.expiresAt === 'number'
  );
}

function matchesMarker(marker: InternalTabCreationMarker, tab: chrome.tabs.Tab): boolean {
  const url = tab.pendingUrl ?? tab.url ?? null;
  const hasTransientCreationUrl = url === null || url === '' || url === 'about:blank';
  return (
    (marker.windowId === null || marker.windowId === tab.windowId) &&
    (marker.url === null || marker.url === url || hasTransientCreationUrl)
  );
}
