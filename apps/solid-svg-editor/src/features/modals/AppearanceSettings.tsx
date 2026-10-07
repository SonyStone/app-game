import type { JSX } from '@solidjs/web';
import { For, Show } from 'solid-js';

import { highlighterPresets, isHexColor, type HighlighterColors, type HighlighterPreset } from '../../editor/appearance';
import { themePresetSettings } from '../../editor/tree-utils';
import type { AppSettings, ThemePreset } from '../../editor/types';
import { useI18n } from '../../i18n/I18nProvider';
import type { FontRole } from '../appearance/createCustomFonts';
import { CheckboxField, FormInput, FormSelect, SettingsField } from './settings-fields';

type SettingsProps = {
  readonly settings: AppSettings;
  readonly setSettings: (setter: (settings: AppSettings) => AppSettings) => void;
};

/** Stores (`choose`) or forgets (`reset`) the font file for a role; `choose` rejects for unreadable fonts. */
export type FontActions = {
  readonly choose: (role: FontRole, file: File) => Promise<void>;
  readonly reset: (role: FontRole) => void;
};

/**
 * GodSVG's Theming settings: the theme preset (which resets the colors that depend on it), primary colors, fonts, SVG
 * text colors, handles, the selection rectangle, canvas, and basic colors.
 */
export function ThemingSettings(props: SettingsProps & { readonly fonts: FontActions }) {
  const { t } = useI18n();
  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => props.setSettings((settings) => ({ ...settings, [key]: value }));
  const setIn = <K extends 'handles' | 'selectionRectangle' | 'basicColors' | 'highlighter'>(key: K, change: Partial<AppSettings[K]>) =>
    props.setSettings((settings) => ({ ...settings, [key]: { ...settings[key], ...change } }));

  return (
    <div class="grid gap-2.5" data-testid="settings-theming">
      <SettingsField>
        {t('Theme preset')}
        <FormSelect
          value={props.settings.themePreset}
          data-testid="settings-theme-select"
          onChange={(event) => props.setSettings((settings) => themePresetSettings(event.currentTarget.value as ThemePreset, settings))}
        >
          <option value="dark">{t('Dark')}</option>
          <option value="light">{t('Light')}</option>
          <option value="black">{t('Black (OLED)')}</option>
          <option value="gray">{t('Gray')}</option>
        </FormSelect>
      </SettingsField>

      <Section title={t('Primary theme colors')}>
        <ColorSetting label={t('Base color')} testId="settings-base-color" value={props.settings.baseColor} alpha={false} set={(value) => set('baseColor', value)} />
        <ColorSetting label={t('Accent color')} testId="settings-accent-color" value={props.settings.accentColor} alpha={false} set={(value) => set('accentColor', value)} />
      </Section>

      <Section title={t('Fonts')}>
        <For each={fontRoles}>
          {(role) => (
            <FontSetting
              label={t(role.label)}
              role={role.id}
              file={props.settings.fonts[role.id]}
              choose={async (file) => {
                await props.fonts.choose(role.id, file);
                props.setSettings((settings) => ({ ...settings, fonts: { ...settings.fonts, [role.id]: file.name } }));
              }}
              reset={() => {
                props.fonts.reset(role.id);
                props.setSettings((settings) => {
                  const fonts = { ...settings.fonts };
                  delete fonts[role.id];
                  return { ...settings, fonts };
                });
              }}
            />
          )}
        </For>
      </Section>

      <Section title={t('SVG Text colors')}>
        <SettingsField>
          {t('Highlighter preset')}
          <FormSelect
            value={props.settings.highlighterPreset}
            data-testid="settings-highlighter-preset"
            onChange={(event) => {
              const preset = event.currentTarget.value as HighlighterPreset;
              props.setSettings((settings) => ({ ...settings, highlighterPreset: preset, highlighter: highlighterPresets[preset] }));
            }}
          >
            <option value="default-dark">{t('Default Dark')}</option>
            <option value="default-light">{t('Default Light')}</option>
          </FormSelect>
        </SettingsField>
        <For each={highlighterFields}>
          {(field) => (
            <ColorSetting
              label={t(field.label)}
              testId={`settings-highlighter-${field.key}`}
              value={props.settings.highlighter[field.key]}
              alpha
              set={(value) => setIn('highlighter', { [field.key]: value } as Partial<HighlighterColors>)}
            />
          )}
        </For>
      </Section>

      <Section title={t('Handles')}>
        <NumberChoice
          label={t('Size')}
          testId="settings-handle-size"
          value={props.settings.handles.size}
          options={[0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]}
          set={(size) => setIn('handles', { size })}
        />
        <For each={handleFields}>
          {(field) => (
            <ColorSetting
              label={t(field.label)}
              testId={`settings-handle-${field.key}`}
              value={props.settings.handles[field.key]}
              alpha={false}
              set={(value) => setIn('handles', { [field.key]: value })}
            />
          )}
        </For>
      </Section>

      <Section title={t('Selection rectangle')}>
        <NumberChoice
          label={t('Speed')}
          testId="settings-selection-speed"
          value={props.settings.selectionRectangle.speed}
          options={[0, 10, 20, 30, 50, 80, 130]}
          set={(speed) => setIn('selectionRectangle', { speed })}
        />
        <NumberChoice
          label={t('Width')}
          testId="settings-selection-width"
          value={props.settings.selectionRectangle.width}
          options={[1, 2, 3, 4]}
          set={(width) => setIn('selectionRectangle', { width })}
        />
        <NumberChoice
          label={t('Dash length')}
          testId="settings-selection-dash"
          value={props.settings.selectionRectangle.dashLength}
          options={[5, 10, 15, 20]}
          set={(dashLength) => setIn('selectionRectangle', { dashLength })}
        />
        <ColorSetting
          label={t('Color {index}', { index: 1 })}
          testId="settings-selection-color1"
          value={props.settings.selectionRectangle.color1}
          alpha
          set={(color1) => setIn('selectionRectangle', { color1 })}
        />
        <ColorSetting
          label={t('Color {index}', { index: 2 })}
          testId="settings-selection-color2"
          value={props.settings.selectionRectangle.color2}
          alpha
          set={(color2) => setIn('selectionRectangle', { color2 })}
        />
      </Section>

      <Section title={t('Canvas')}>
        <ColorSetting label={t('Canvas color')} testId="settings-canvas-color" value={props.settings.canvasColor} alpha={false} set={(value) => set('canvasColor', value)} />
        <ColorSetting label={t('Grid color')} testId="settings-grid-color" value={props.settings.gridColor} alpha={false} set={(value) => set('gridColor', value)} />
        <SettingsField>
          {t('Grid tick interval')}
          <FormSelect
            value={String(props.settings.gridTickInterval)}
            data-testid="settings-grid-tick-interval"
            onChange={(event) => set('gridTickInterval', Number(event.currentTarget.value))}
          >
            <option value="0">{t('No ticks')}</option>
            <option value="4">4</option>
            <option value="5">5</option>
          </FormSelect>
        </SettingsField>
      </Section>

      <Section title={t('Basic colors')}>
        <ColorSetting label={t('Valid color')} testId="settings-valid-color" value={props.settings.basicColors.valid} alpha={false} set={(valid) => setIn('basicColors', { valid })} />
        <ColorSetting label={t('Error color')} testId="settings-error-color" value={props.settings.basicColors.error} alpha={false} set={(error) => setIn('basicColors', { error })} />
        <ColorSetting label={t('Warning color')} testId="settings-warning-color" value={props.settings.basicColors.warning} alpha={false} set={(warning) => setIn('basicColors', { warning })} />
      </Section>
    </div>
  );
}

/** GodSVG's Other settings: input, display, and miscellaneous options a browser supports. */
export function OtherSettings(props: SettingsProps) {
  const { t } = useI18n();
  const toggle = (key: 'invertZoom' | 'panWithLmb' | 'useCtrlForZoom' | 'keepScreenOn' | 'useFilenameForWindowTitle' | 'rasterPreviewDuringInteraction') =>
    (event: Event & { readonly currentTarget: HTMLInputElement }) =>
      props.setSettings((settings) => ({ ...settings, [key]: event.currentTarget.checked }));

  return (
    <div class="grid gap-2.5" data-testid="settings-other">
      <Section title={t('Input')}>
        <CheckboxField>
          <FormInput type="checkbox" data-testid="settings-invert-zoom" checked={props.settings.invertZoom} onChange={toggle('invertZoom')} />
          <span title={t('Swaps the scroll directions for zooming in and zooming out.')}>{t('Invert zoom direction')}</span>
        </CheckboxField>
        <CheckboxField>
          <FormInput type="checkbox" data-testid="settings-pan-with-lmb" checked={props.settings.panWithLmb} onChange={toggle('panWithLmb')} />
          <span title={t('When enabled, the left mouse button can be used to pan the canvas.')}>{t('Pan with left mouse button')}</span>
        </CheckboxField>
        <CheckboxField>
          <FormInput type="checkbox" data-testid="settings-wraparound-panning" checked={false} disabled />
          <span class="text-[var(--muted)]" title={t("The setting can't be changed on this platform.")}>
            {t('Wrap-around panning')}
          </span>
        </CheckboxField>
        <NumberChoice
          label={t('Panning speed')}
          testId="settings-panning-speed"
          value={props.settings.panningSpeed}
          options={[5, 10, 20, 30, 50]}
          set={(panningSpeed) => props.setSettings((settings) => ({ ...settings, panningSpeed }))}
        />
        <CheckboxField>
          <FormInput type="checkbox" data-testid="settings-use-ctrl-for-zoom" checked={props.settings.useCtrlForZoom} onChange={toggle('useCtrlForZoom')} />
          <span title={t('When enabled, scrolling pans the view instead of zooming in. To zoom, hold CTRL while scrolling.')}>
            {t('Use CTRL for zooming')}
          </span>
        </CheckboxField>
      </Section>

      <Section title={t('Display')}>
        <SettingsField>
          <span title={t('Determines the scale factor for the interface.')}>{t('UI scale')}</span>
          <FormSelect
            value={String(props.settings.uiScale)}
            data-testid="settings-ui-scale"
            onChange={(event) => {
              const value = event.currentTarget.value;
              props.setSettings((settings) => ({ ...settings, uiScale: value === 'auto' ? 'auto' : Number(value) }));
            }}
          >
            <option value="auto">Auto</option>
            <For each={[0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4]}>{(scale) => <option value={String(scale)}>{`${scale * 100}%`}</option>}</For>
          </FormSelect>
        </SettingsField>
        <CheckboxField>
          <FormInput type="checkbox" data-testid="settings-keep-screen-on" checked={props.settings.keepScreenOn} onChange={toggle('keepScreenOn')} />
          <span title={t('Keeps the screen on even after inactivity, so the screensaver does not take over.')}>{t('Keep screen on')}</span>
        </CheckboxField>
      </Section>

      <Section title={t('Miscellaneous')}>
        <CheckboxField>
          <FormInput
            type="checkbox"
            data-testid="settings-sync-window-title"
            checked={props.settings.useFilenameForWindowTitle}
            onChange={toggle('useFilenameForWindowTitle')}
          />
          <span title={t('When enabled, adds the current file name before the "GodSVG" window title.')}>{t('Sync window title to file name')}</span>
        </CheckboxField>
        <CheckboxField>
          <FormInput
            type="checkbox"
            data-testid="settings-raster-preview-during-interaction"
            checked={props.settings.rasterPreviewDuringInteraction}
            onChange={toggle('rasterPreviewDuringInteraction')}
          />
          Raster preview while panning or zooming
        </CheckboxField>
        <CheckboxField>
          <FormInput
            type="checkbox"
            data-testid="settings-show-shortcut-panel"
            checked={props.settings.shortcutPanel.visible}
            onChange={(event) =>
              props.setSettings((settings) => ({
                ...settings,
                shortcutPanel: { ...settings.shortcutPanel, visible: event.currentTarget.checked }
              }))
            }
          />
          Show shortcut panel
        </CheckboxField>
      </Section>
    </div>
  );
}

const fontRoles = [
  { id: 'main', label: 'Main font' },
  { id: 'bold', label: 'Bold font' },
  { id: 'mono', label: 'Mono font' }
] as const satisfies readonly { readonly id: FontRole; readonly label: string }[];

const highlighterFields = [
  { key: 'symbol', label: 'Symbol color' },
  { key: 'element', label: 'Element color' },
  { key: 'attribute', label: 'Attribute color' },
  { key: 'string', label: 'String color' },
  { key: 'comment', label: 'Comment color' },
  { key: 'text', label: 'Text color' },
  { key: 'entity', label: 'XML entity color' },
  { key: 'cdata', label: 'CDATA color' },
  { key: 'error', label: 'Error color' }
] as const satisfies readonly { readonly key: keyof HighlighterColors; readonly label: string }[];

const handleFields = [
  { key: 'inside', label: 'Inside color' },
  { key: 'normal', label: 'Normal color' },
  { key: 'hovered', label: 'Hovered color' },
  { key: 'selected', label: 'Selected color' },
  { key: 'hoveredSelected', label: 'Hovered selected color' }
] as const satisfies readonly { readonly key: Exclude<keyof AppSettings['handles'], 'size'>; readonly label: string }[];

function Section(props: { readonly title: string; readonly children: JSX.Element }) {
  return (
    <fieldset class="grid gap-2 rounded-md border border-[var(--soft-border)] p-2.5">
      <legend>{props.title}</legend>
      {props.children}
    </fieldset>
  );
}

/**
 * A color setting: a hex field (with alpha when `alpha`) and the browser's color picker, which keeps the alpha
 * digits. Invalid text is reverted.
 */
function ColorSetting(props: {
  readonly label: string;
  readonly testId: string;
  readonly value: string;
  readonly alpha: boolean;
  readonly set: (value: string) => void;
}) {
  const rgb = () => expandHex(props.value).slice(0, 7);
  const alphaDigits = () => expandHex(props.value).slice(7);

  return (
    <SettingsField>
      {props.label}
      <div class="flex min-w-0 items-center gap-1.5">
        <FormInput
          type="color"
          class="h-5.5 w-8"
          data-testid={`${props.testId}-picker`}
          value={rgb()}
          onInput={(event) => props.set(`${event.currentTarget.value}${props.alpha ? alphaDigits() : ''}`)}
        />
        <FormInput
          type="text"
          data-testid={props.testId}
          value={props.value}
          onChange={(event) => {
            const text = event.currentTarget.value.trim();

            if (isHexColor(text) && (props.alpha || text.length === 4 || text.length === 7)) {
              props.set(text.toLowerCase());
            } else {
              event.currentTarget.value = props.value;
            }
          }}
        />
      </div>
    </SettingsField>
  );
}

/** `#rgb`/`#rgba` → `#rrggbb`/`#rrggbbaa`; longer forms unchanged. */
function expandHex(color: string): string {
  return color.length === 4 || color.length === 5 ? `#${[...color.slice(1)].map((digit) => digit + digit).join('')}` : color;
}

function NumberChoice(props: {
  readonly label: string;
  readonly testId: string;
  readonly value: number;
  readonly options: readonly number[];
  readonly set: (value: number) => void;
}) {
  const options = () => (props.options.includes(props.value) ? props.options : [...props.options, props.value].sort((a, b) => a - b));

  return (
    <SettingsField>
      {props.label}
      <FormSelect value={String(props.value)} data-testid={props.testId} onChange={(event) => props.set(Number(event.currentTarget.value))}>
        <For each={options()}>{(option) => <option value={String(option)}>{option}</option>}</For>
      </FormSelect>
    </SettingsField>
  );
}

/** A font file setting: the chosen file's name (or the default), a file picker, and a reset. */
function FontSetting(props: {
  readonly label: string;
  readonly role: FontRole;
  readonly file: string | undefined;
  readonly choose: (file: File) => Promise<void>;
  readonly reset: () => void;
}) {
  const { t } = useI18n();
  let input: HTMLInputElement | undefined;

  return (
    <SettingsField>
      {props.label}
      <div class="flex min-w-0 items-center gap-1.5">
        <span class="min-w-0 flex-1 truncate text-[11px] text-[var(--muted)]" data-testid={`settings-font-${props.role}-name`}>
          {props.file ?? 'Default'}
        </span>
        <input
          ref={(element) => (input = element)}
          type="file"
          class="hidden"
          accept=".ttf,.otf,.woff,.woff2,font/*"
          data-testid={`settings-font-${props.role}-input`}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';

            if (file) {
              void props.choose(file).catch(() => undefined);
            }
          }}
        />
        <button
          type="button"
          class="h-5.5 cursor-pointer rounded border border-[var(--soft-border)] bg-[var(--panel)] px-1.5 text-[11px] hover:border-[var(--accent)]"
          data-testid={`settings-font-${props.role}-browse`}
          onClick={() => input?.click()}
        >
          …
        </button>
        <Show when={props.file}>
          <button
            type="button"
            class="h-5.5 cursor-pointer rounded border border-[var(--soft-border)] bg-[var(--panel)] px-1.5 text-[11px] hover:border-[var(--accent)]"
            data-testid={`settings-font-${props.role}-reset`}
            onClick={props.reset}
          >
            {t('Reset to default')}
          </button>
        </Show>
      </div>
    </SettingsField>
  );
}
