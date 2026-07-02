import { cn } from '@app-game/utils/cn';

import type { AppSettings, ThemePreset } from '../../editor/types';

export type AppThemeVars = Record<'--base' | '--accent' | '--canvas' | '--grid', string>;

export const appRootBaseClass = cn(
  'app-root box-border grid h-dvh min-h-dvh w-full grid-rows-[32px_minmax(0,1fr)]',
  "bg-[var(--base)] font-['GodSVG_Sans',system-ui,sans-serif] text-[var(--text)] [color-scheme:dark]",
  '[--border:color-mix(in_srgb,var(--base)_52%,#8fa7d7)] [--danger:#ff8f9d] [--muted:#98a4b8] [--ok:#a3ffb0] [--panel-2:color-mix(in_srgb,var(--base)_70%,#28304a)] [--panel-3:color-mix(in_srgb,var(--base)_55%,#37415f)] [--panel:color-mix(in_srgb,var(--base)_82%,#273047)] [--soft-border:color-mix(in_srgb,var(--base)_72%,#8fa7d7)] [--text:#dfe7f7] [--warning:#ffd761]'
);

export const appRootThemeClass = {
  dark: '',
  light:
    'theme-light [color-scheme:light] [--border:#7893b9] [--danger:#a91527] [--muted:#4f627d] [--ok:#247c31] [--panel-2:#cfdef1] [--panel-3:#b9cce5] [--panel:#dce9fb] [--soft-border:#a8bbd4] [--text:#10203a] [--warning:#8a6500]',
  black:
    'theme-black [--border:#46506f] [--panel-2:#10131f] [--panel-3:#171b2a] [--panel:#080a10] [--soft-border:#272e40]',
  gray: 'theme-gray [--border:#6a6a6a] [--panel-2:#383838] [--panel-3:#454545] [--panel:#303030] [--soft-border:#555]'
} as const satisfies Record<ThemePreset, string>;

export function createAppThemeVars(settings: AppSettings): AppThemeVars {
  return {
    '--base': settings.baseColor,
    '--accent': settings.accentColor,
    '--canvas': settings.canvasColor,
    '--grid': settings.gridColor
  };
}
