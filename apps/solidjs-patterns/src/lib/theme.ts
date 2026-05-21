export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'solidjs-patterns-theme-mode';
export const THEME_MEDIA_QUERY = '(prefers-color-scheme: dark)';

export function getStoredThemeMode(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'system';
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

  return isThemeMode(storedTheme) ? storedTheme : 'system';
}

export function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') {
    return 'dark';
  }

  return window.matchMedia(THEME_MEDIA_QUERY).matches ? 'dark' : 'light';
}

export function resolveTheme(themeMode: ThemeMode, systemTheme: ResolvedTheme = getSystemTheme()): ResolvedTheme {
  return themeMode === 'system' ? systemTheme : themeMode;
}

export function applyTheme(themeMode: ThemeMode, systemTheme: ResolvedTheme = getSystemTheme()): ResolvedTheme {
  const resolvedTheme = resolveTheme(themeMode, systemTheme);

  if (typeof document !== 'undefined') {
    const root = document.documentElement;

    root.classList.toggle('dark', resolvedTheme === 'dark');
    root.dataset.theme = resolvedTheme;
    root.dataset.themeMode = themeMode;
    root.style.colorScheme = resolvedTheme;
  }

  return resolvedTheme;
}

export function persistThemeMode(themeMode: ThemeMode): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
}

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}
