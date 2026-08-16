/** User-configurable Browser Atlas behavior shared by the extension and localhost mock. */
export type BrowserAtlasSettings = Readonly<{
  /** Follow externally focused browser windows in the primary Explore pane. */
  autoFollowFocusedWindow: boolean;
  /** Activate or restore tree items on the first click instead of a double click. */
  oneClickActivation: boolean;
  /** Open Browser Atlas automatically when the browser starts. */
  openOnStartup: boolean;
  /** Nest newly opened tabs below the live tab reported as their browser opener. */
  nestNewTabsUnderOpener: boolean;
  /** Reapply a retained window's last known screen position and size when restoring it. */
  restoreWindowsInOriginalBounds: boolean;
  /** Theme and tree-label colors applied immediately to both explorer panes. */
  appearance: BrowserAtlasAppearanceSettings;
}>;

/** Appearance controls retained even while their individual overrides are disabled. */
export type BrowserAtlasAppearanceSettings = Readonly<{
  /** Use the original extension's experimental light-background treatment. */
  lightBackground: boolean;
  /** Optional color for retained, non-live tabs. */
  savedTab: BrowserAtlasColorOverride;
  /** Optional color for open tabs that are not active. */
  openTab: BrowserAtlasColorOverride;
  /** Optional color for active open tabs. */
  activeTab: BrowserAtlasColorOverride;
  /** Optional color for saved and imported notes. */
  note: BrowserAtlasColorOverride;
}>;

/** A remembered six-digit color whose effect can be independently enabled. */
export type BrowserAtlasColorOverride = Readonly<{
  enabled: boolean;
  color: string;
}>;

/** Defaults matching the original Tabs Outliner interaction model. */
export const DEFAULT_BROWSER_ATLAS_SETTINGS = {
  autoFollowFocusedWindow: true,
  oneClickActivation: false,
  openOnStartup: false,
  nestNewTabsUnderOpener: true,
  restoreWindowsInOriginalBounds: true,
  appearance: {
    lightBackground: false,
    savedTab: { enabled: false, color: '#606060' },
    openTab: { enabled: false, color: '#9CB7D3' },
    activeTab: { enabled: false, color: '#ffffff' },
    note: { enabled: false, color: '#DAD2B4' }
  }
} as const satisfies BrowserAtlasSettings;

/** Reads validated settings from extension storage or localhost localStorage. */
export async function readBrowserAtlasSettings(): Promise<BrowserAtlasSettings> {
  const extensionStorage = getExtensionStorage();
  if (extensionStorage) {
    const stored = await extensionStorage.local.get(BROWSER_ATLAS_SETTINGS_STORAGE_KEY);
    return parseBrowserAtlasSettings(stored[BROWSER_ATLAS_SETTINGS_STORAGE_KEY]);
  }
  try {
    const serialized = globalThis.localStorage?.getItem(BROWSER_ATLAS_SETTINGS_STORAGE_KEY);
    return serialized ? parseBrowserAtlasSettings(JSON.parse(serialized) as unknown) : DEFAULT_BROWSER_ATLAS_SETTINGS;
  } catch {
    return DEFAULT_BROWSER_ATLAS_SETTINGS;
  }
}

/** Persists a complete settings snapshot in the current runtime. */
export async function writeBrowserAtlasSettings(settings: BrowserAtlasSettings): Promise<void> {
  const extensionStorage = getExtensionStorage();
  if (extensionStorage) {
    await extensionStorage.local.set({ [BROWSER_ATLAS_SETTINGS_STORAGE_KEY]: settings });
    return;
  }
  globalThis.localStorage?.setItem(BROWSER_ATLAS_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

/** Observes settings written by another extension page or browser tab. */
export function subscribeBrowserAtlasSettings(listener: (settings: BrowserAtlasSettings) => void): () => void {
  const extensionStorage = getExtensionStorage();
  if (extensionStorage) {
    const handleStorageChange = (changes: Record<string, ExtensionStorageChange>, areaName: string) => {
      if (areaName === 'local' && changes[BROWSER_ATLAS_SETTINGS_STORAGE_KEY]) {
        listener(parseBrowserAtlasSettings(changes[BROWSER_ATLAS_SETTINGS_STORAGE_KEY]?.newValue));
      }
    };
    extensionStorage.onChanged.addListener(handleStorageChange);
    return () => extensionStorage.onChanged.removeListener(handleStorageChange);
  }

  const handleStorageEvent = (event: LocalStorageEvent) => {
    if (event.key !== BROWSER_ATLAS_SETTINGS_STORAGE_KEY) {
      return;
    }
    try {
      listener(event.newValue ? parseBrowserAtlasSettings(JSON.parse(event.newValue) as unknown) : DEFAULT_BROWSER_ATLAS_SETTINGS);
    } catch {
      listener(DEFAULT_BROWSER_ATLAS_SETTINGS);
    }
  };
  const eventTarget = globalThis as typeof globalThis & LocalStorageEventTarget;
  eventTarget.addEventListener?.('storage', handleStorageEvent);
  return () => eventTarget.removeEventListener?.('storage', handleStorageEvent);
}

type LocalStorageEvent = Readonly<{ key: string | null; newValue: string | null }>;

type LocalStorageEventTarget = Readonly<{
  addEventListener?: (type: 'storage', listener: (event: LocalStorageEvent) => void) => void;
  removeEventListener?: (type: 'storage', listener: (event: LocalStorageEvent) => void) => void;
}>;

function parseBrowserAtlasSettings(value: unknown): BrowserAtlasSettings {
  if (!isRecord(value)) {
    return DEFAULT_BROWSER_ATLAS_SETTINGS;
  }
  return {
    autoFollowFocusedWindow:
      typeof value.autoFollowFocusedWindow === 'boolean'
        ? value.autoFollowFocusedWindow
        : DEFAULT_BROWSER_ATLAS_SETTINGS.autoFollowFocusedWindow,
    oneClickActivation:
      typeof value.oneClickActivation === 'boolean'
        ? value.oneClickActivation
        : DEFAULT_BROWSER_ATLAS_SETTINGS.oneClickActivation,
    openOnStartup:
      typeof value.openOnStartup === 'boolean'
        ? value.openOnStartup
        : DEFAULT_BROWSER_ATLAS_SETTINGS.openOnStartup,
    nestNewTabsUnderOpener:
      typeof value.nestNewTabsUnderOpener === 'boolean'
        ? value.nestNewTabsUnderOpener
        : DEFAULT_BROWSER_ATLAS_SETTINGS.nestNewTabsUnderOpener,
    restoreWindowsInOriginalBounds:
      typeof value.restoreWindowsInOriginalBounds === 'boolean'
        ? value.restoreWindowsInOriginalBounds
        : DEFAULT_BROWSER_ATLAS_SETTINGS.restoreWindowsInOriginalBounds,
    appearance: parseAppearanceSettings(value.appearance)
  };
}

function parseAppearanceSettings(value: unknown): BrowserAtlasAppearanceSettings {
  if (!isRecord(value)) {
    return DEFAULT_BROWSER_ATLAS_SETTINGS.appearance;
  }
  return {
    lightBackground:
      typeof value.lightBackground === 'boolean'
        ? value.lightBackground
        : DEFAULT_BROWSER_ATLAS_SETTINGS.appearance.lightBackground,
    savedTab: parseColorOverride(value.savedTab, DEFAULT_BROWSER_ATLAS_SETTINGS.appearance.savedTab),
    openTab: parseColorOverride(value.openTab, DEFAULT_BROWSER_ATLAS_SETTINGS.appearance.openTab),
    activeTab: parseColorOverride(value.activeTab, DEFAULT_BROWSER_ATLAS_SETTINGS.appearance.activeTab),
    note: parseColorOverride(value.note, DEFAULT_BROWSER_ATLAS_SETTINGS.appearance.note)
  };
}

function parseColorOverride(value: unknown, fallback: BrowserAtlasColorOverride): BrowserAtlasColorOverride {
  if (!isRecord(value)) {
    return fallback;
  }
  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : fallback.enabled,
    color: typeof value.color === 'string' && HEX_COLOR_PATTERN.test(value.color) ? value.color : fallback.color
  };
}

function getExtensionStorage(): ExtensionStorage | undefined {
  const candidate: unknown = Reflect.get(globalThis, 'chrome');
  if (!isRecord(candidate) || !isRecord(candidate.storage)) {
    return undefined;
  }
  return isExtensionStorage(candidate.storage) ? candidate.storage : undefined;
}

function isExtensionStorage(value: unknown): value is ExtensionStorage {
  if (!isRecord(value) || !isRecord(value.local) || !isRecord(value.onChanged)) {
    return false;
  }
  return (
    typeof value.local.get === 'function' &&
    typeof value.local.set === 'function' &&
    typeof value.onChanged.addListener === 'function' &&
    typeof value.onChanged.removeListener === 'function'
  );
}

type ExtensionStorage = Readonly<{
  local: Readonly<{
    get: (key: string) => Promise<Record<string, unknown>>;
    set: (values: Record<string, unknown>) => Promise<void>;
  }>;
  onChanged: Readonly<{
    addListener: (listener: ExtensionStorageListener) => void;
    removeListener: (listener: ExtensionStorageListener) => void;
  }>;
}>;

type ExtensionStorageListener = (
  changes: Record<string, ExtensionStorageChange>,
  areaName: string
) => void;

type ExtensionStorageChange = Readonly<{ newValue?: unknown }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Storage key shared by the explorer page and MV3 background worker. */
export const BROWSER_ATLAS_SETTINGS_STORAGE_KEY = 'browserAtlas.settings.v1';

const HEX_COLOR_PATTERN = /^#[\da-f]{6}$/iu;
