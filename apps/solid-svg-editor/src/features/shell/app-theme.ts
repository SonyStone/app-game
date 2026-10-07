// @unocss-include — UnoCSS skips plain .ts modules; this file defines the app-root utility classes.
import { cn } from '@app-game/utils/cn';

import type { AppSettings, ThemePreset } from '../../editor/types';

export type AppThemeVars = Record<'--base' | '--accent' | '--canvas' | '--grid' | AppThemeColorVar | SettingColorVar, string> & {
  readonly 'color-scheme': 'dark' | 'light';
  readonly 'font-family': string;
  /** GodSVG's UI scale; `undefined` leaves the browser's zoom alone. */
  readonly zoom: string | undefined;
};

/** Colors from the settings: highlighter (`--hl-*`) and handle (`--handle-*`) colors. */
type SettingColorVar = `--hl-${keyof AppSettings['highlighter']}` | `--handle-${Exclude<keyof AppSettings['handles'], 'size'>}`;

type AppThemeColorVar =
  | '--border'
  | '--danger'
  | '--muted'
  | '--ok'
  | '--panel-2'
  | '--panel-3'
  | '--panel'
  | '--soft-border'
  | '--text'
  | '--warning';

const defaultThemeVars = {
  '--border': 'color-mix(in srgb, var(--base) 52%, #8fa7d7)',
  '--danger': '#ff8f9d',
  '--muted': '#98a4b8',
  '--ok': '#a3ffb0',
  '--panel-2': 'color-mix(in srgb, var(--base) 70%, #28304a)',
  '--panel-3': 'color-mix(in srgb, var(--base) 55%, #37415f)',
  '--panel': 'color-mix(in srgb, var(--base) 82%, #273047)',
  '--soft-border': 'color-mix(in srgb, var(--base) 72%, #8fa7d7)',
  '--text': '#dfe7f7',
  '--warning': '#ffd761'
} satisfies Record<AppThemeColorVar, string>;

const themePresetVars = {
  dark: {},
  light: {
    '--border': '#7893b9',
    '--danger': '#a91527',
    '--muted': '#4f627d',
    '--ok': '#247c31',
    '--panel-2': '#cfdef1',
    '--panel-3': '#b9cce5',
    '--panel': '#dce9fb',
    '--soft-border': '#a8bbd4',
    '--text': '#10203a',
    '--warning': '#8a6500'
  },
  black: {
    '--border': '#46506f',
    '--panel-2': '#10131f',
    '--panel-3': '#171b2a',
    '--panel': '#080a10',
    '--soft-border': '#272e40'
  },
  gray: {
    '--border': '#6a6a6a',
    '--panel-2': '#383838',
    '--panel-3': '#454545',
    '--panel': '#303030',
    '--soft-border': '#555'
  }
} satisfies Record<ThemePreset, Partial<Record<AppThemeColorVar, string>>>;

export const appRootBaseClass = cn(
  'app-root box-border grid h-dvh min-h-dvh w-full grid-rows-[32px_minmax(0,1fr)] text-[13px]',
  'bg-[var(--base)] text-[var(--text)]'
);

export const appRootThemeClass = {
  dark: '',
  light: 'theme-light',
  black: 'theme-black',
  gray: 'theme-gray'
} as const satisfies Record<ThemePreset, string>;

export function createAppThemeVars(settings: AppSettings): AppThemeVars {
  return {
    ...defaultThemeVars,
    ...themePresetVars[settings.themePreset],
    'color-scheme': settings.themePreset === 'light' ? 'light' : 'dark',
    'font-family': "'GodSVG Sans', system-ui, sans-serif",
    '--base': settings.baseColor,
    '--accent': settings.accentColor,
    '--canvas': settings.canvasColor,
    '--grid': settings.gridColor,
    // GodSVG's basic colors drive the valid, error, and warning accents.
    '--ok': settings.basicColors.valid,
    '--danger': settings.basicColors.error,
    '--warning': settings.basicColors.warning,
    ...prefixed('--hl-', settings.highlighter),
    ...prefixed('--handle-', {
      inside: settings.handles.inside,
      normal: settings.handles.normal,
      hovered: settings.handles.hovered,
      selected: settings.handles.selected,
      hoveredSelected: settings.handles.hoveredSelected
    }),
    zoom: settings.uiScale === 'auto' ? undefined : String(settings.uiScale)
  };
}

function prefixed<P extends string, T extends Record<string, string>>(prefix: P, colors: T): Record<`${P}${keyof T & string}`, string> {
  return Object.fromEntries(Object.entries(colors).map(([key, value]) => [`${prefix}${key}`, value])) as Record<
    `${P}${keyof T & string}`,
    string
  >;
}
