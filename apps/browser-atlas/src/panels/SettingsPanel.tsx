import type { JSX } from '@solidjs/web';
import type { BrowserAtlasAppearanceSettings, BrowserAtlasColorOverride, BrowserAtlasSettings } from '../settings';

/** Settings panel: interaction and appearance preferences, applied immediately, plus a layout reset. */
export function SettingsPanel(props: {
  settings: BrowserAtlasSettings;
  onChange: <TKey extends keyof BrowserAtlasSettings>(key: TKey, value: BrowserAtlasSettings[TKey]) => void;
  /** Restores the default two-explorer layout. */
  onResetLayout: () => void;
}): JSX.Element {
  return (
    <section class="h-full overflow-y-auto bg-neutral-950 p-3 text-xs print:hidden" aria-label="Browser Atlas settings">
      <SettingsCheckbox
        label="Follow the focused browser window"
        description="Scroll the primary explorer (★) when focus changes outside it."
        checked={props.settings.autoFollowFocusedWindow}
        onChange={(checked) => props.onChange('autoFollowFocusedWindow', checked)}
      />
      <SettingsCheckbox
        label="Activate with one click"
        description="Otherwise live and saved tabs/windows activate on double click."
        checked={props.settings.oneClickActivation}
        onChange={(checked) => props.onChange('oneClickActivation', checked)}
      />
      <SettingsCheckbox
        label="Open Browser Atlas on startup"
        description="Opens the extension explorer after Chromium starts."
        checked={props.settings.openOnStartup}
        onChange={(checked) => props.onChange('openOnStartup', checked)}
      />
      <SettingsCheckbox
        label="Nest new tabs under their opener"
        description="Tree Style Tabs: preserve which live tab opened each new tab."
        checked={props.settings.nestNewTabsUnderOpener}
        onChange={(checked) => props.onChange('nestNewTabsUnderOpener', checked)}
      />
      <SettingsCheckbox
        label="Restore saved window position and size"
        description="Open retained windows at their last known screen bounds."
        checked={props.settings.restoreWindowsInOriginalBounds}
        onChange={(checked) => props.onChange('restoreWindowsInOriginalBounds', checked)}
      />
      <div class="mb-3 border-t border-neutral-700 pt-3 font-medium text-neutral-200">Appearance</div>
      <SettingsCheckbox
        label="Use light background"
        description="Use the original extension's experimental light color scheme."
        checked={props.settings.appearance.lightBackground}
        onChange={(checked) => updateAppearance('lightBackground', checked)}
      />
      <label class="mb-3 flex items-center gap-2">
        <span class="flex-1">
          <span class="block text-neutral-100">Tree lines</span>
          <span class="block text-neutral-400">Classic connectors, or a metro map with a line per window.</span>
        </span>
        <select
          class="h-6 rounded border border-neutral-700 bg-neutral-950 px-1 text-xs text-neutral-200"
          aria-label="Tree lines"
          value={props.settings.appearance.treeStyle}
          onChange={(event) =>
            updateAppearance('treeStyle', event.currentTarget.value === 'metro' ? 'metro' : 'classic')
          }
        >
          <option value="classic">Classic</option>
          <option value="metro">Metro</option>
        </select>
      </label>
      <SettingsCheckbox
        label="Highlight the path to a row"
        description="Light up the lines to the row under the pointer, or to the focused row."
        checked={props.settings.appearance.pathHighlight}
        onChange={(checked) => updateAppearance('pathHighlight', checked)}
      />
      <SettingsColorOverride
        label="Saved tab"
        value={props.settings.appearance.savedTab}
        onChange={(value) => updateAppearance('savedTab', value)}
      />
      <SettingsColorOverride
        label="Open tab"
        value={props.settings.appearance.openTab}
        onChange={(value) => updateAppearance('openTab', value)}
      />
      <SettingsColorOverride
        label="Active tab"
        value={props.settings.appearance.activeTab}
        onChange={(value) => updateAppearance('activeTab', value)}
      />
      <SettingsColorOverride
        label="Note"
        value={props.settings.appearance.note}
        onChange={(value) => updateAppearance('note', value)}
      />
      <div class="mb-3 border-t border-neutral-700 pt-3 font-medium text-neutral-200">Panels</div>
      <button
        type="button"
        class="rounded border border-neutral-600 px-2 py-1 text-neutral-200 hover:bg-neutral-800"
        title="Close every panel and open the two default explorers"
        onClick={() => props.onResetLayout()}
      >
        Reset panel layout
      </button>
    </section>
  );

  function updateAppearance<TKey extends keyof BrowserAtlasAppearanceSettings>(
    key: TKey,
    value: BrowserAtlasAppearanceSettings[TKey]
  ): void {
    props.onChange('appearance', { ...props.settings.appearance, [key]: value });
  }
}

function SettingsCheckbox(props: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label class="mb-3 flex cursor-pointer gap-2 last:mb-0">
      <input
        type="checkbox"
        class="mt-0.5"
        checked={props.checked}
        onChange={(event) => props.onChange(event.currentTarget.checked)}
      />
      <span>
        <span class="block text-neutral-100">{props.label}</span>
        <span class="block text-neutral-400">{props.description}</span>
      </span>
    </label>
  );
}

function SettingsColorOverride(props: {
  label: string;
  value: BrowserAtlasColorOverride;
  onChange: (value: BrowserAtlasColorOverride) => void;
}) {
  return (
    <div class="mb-3 flex items-center gap-2 last:mb-0">
      <label class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-neutral-100">
        <input
          type="checkbox"
          checked={props.value.enabled}
          aria-label={`Override ${props.label.toLocaleLowerCase()} color`}
          onChange={(event) => props.onChange({ ...props.value, enabled: event.currentTarget.checked })}
        />
        <span>Override {props.label.toLocaleLowerCase()} color</span>
      </label>
      <input
        type="color"
        class="h-6 w-8 cursor-pointer border-0 bg-transparent p-0"
        aria-label={`${props.label} color`}
        value={props.value.color}
        onInput={(event) => props.onChange({ ...props.value, color: event.currentTarget.value })}
      />
    </div>
  );
}
