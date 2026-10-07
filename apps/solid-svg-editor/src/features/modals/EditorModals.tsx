import { createEventListener } from '@solid-primitives/event-listener';
import type { JSX } from '@solidjs/web';
import { createEffect, createMemo, createSignal, For, onSettled, Show } from 'solid-js';

import { copyExport, exportFile, exportFileName, rasterSize, renderExport, type ExportOptions } from '../../editor/export-utils';
import { decorativeIconProps, type SvgIcon } from '../../editor/svg-icon';
import { clamp, themePresetSettings } from '../../editor/tree-utils';
import type { AppSettings, ExportFormat, ThemePreset } from '../../editor/types';
import {
  formatterPreset,
  humanFileSize,
  type FormatterPreset,
  type FormatterSettings,
  type FormattingStyle,
  type ShorthandTags
} from '../../formatter';
import { svgSize, type SvgElementNode } from '../../svg-model';
import { PaletteSettings } from '../color-picker/PaletteSettings';
import { PreviewSvg } from '../panels/SidePanels';
import { defaultShortcutItems } from '../shortcuts/shortcutRegistry';
import ClearIcon from '../ui/icons/Clear.svg';
import CopyIcon from '../ui/icons/Copy.svg';
import ExportIcon from '../ui/icons/Export.svg';
import GodSvgIcon from '../ui/icons/GodSvg.svg';
import HeartIcon from '../ui/icons/Heart.svg';
import { PanelButton } from '../ui/PanelButton';

export function SettingsModal(props: {
  readonly settings: AppSettings;
  readonly setSettings: (setter: (settings: AppSettings) => AppSettings) => void;
  readonly close: () => void;
  readonly reformatActiveCode: (formatter?: FormatterSettings) => void;
}) {
  const [tab, setTab] = createSignal<
    'formatting' | 'optimizer' | 'palettes' | 'shortcuts' | 'theming' | 'tabbar' | 'other'
  >('formatting');
  const updateFormatter = (
    key: keyof FormatterSettings,
    value: FormatterSettings[keyof FormatterSettings],
    exportFormatter = false
  ) => {
    props.setSettings((settings) => {
      // Choosing a preset applies its defaults, like GodSVG's preset picker.
      const formatter: FormatterSettings =
        key === 'preset'
          ? formatterPreset(value as FormatterPreset)
          : { ...(exportFormatter ? settings.exportFormatter : settings.formatter), [key]: value };
      return exportFormatter ? { ...settings, exportFormatter: formatter } : { ...settings, formatter };
    });
  };

  return (
    <ModalFrame title="Settings" close={props.close}>
      <div
        class="settings-body grid min-h-120 grid-cols-[150px_minmax(0,1fr)] gap-3 [@media(max-width:820px)]:grid-cols-1"
        data-testid="settings-body"
      >
        <nav class="settings-tabs grid content-start gap-1" data-testid="settings-tabs">
          <For each={['formatting', 'optimizer', 'palettes', 'shortcuts', 'theming', 'tabbar', 'other'] as const}>
            {(item) => (
              <button
                type="button"
                class={[
                  'h-7.5 cursor-pointer rounded-[5px] border border-[var(--soft-border)] bg-[var(--panel-2)] px-2 text-left text-[var(--text)] capitalize [&.active]:border-[var(--accent)] [&.active]:bg-[color-mix(in_srgb,var(--accent)_18%,var(--panel-2))]',
                  { active: tab() === item }
                ]}
                data-testid={`settings-tab-${item}`}
                onClick={() => setTab(item)}
              >
                {item}
              </button>
            )}
          </For>
        </nav>
        <div class="settings-content grid content-start gap-2.5" data-testid="settings-content">
          <Show when={tab() === 'formatting'}>
            <FormatterSettingsView
              label="Editor formatter"
              formatter={props.settings.formatter}
              update={(key, value) => updateFormatter(key, value)}
            />
            <FormatterSettingsView
              label="Export formatter"
              formatter={props.settings.exportFormatter}
              update={(key, value) => updateFormatter(key, value, true)}
            />
            <PanelButton
              type="button"
              data-testid="settings-apply-editor-formatter-button"
              onClick={() => props.reformatActiveCode(props.settings.formatter)}
            >
              Apply editor formatter
            </PanelButton>
          </Show>
          <Show when={tab() === 'optimizer'}>
            <CheckboxField>
              <FormInput
                type="checkbox"
                data-testid="settings-optimizer-remove-comments"
                checked={props.settings.optimizer.removeComments}
                onChange={(event) =>
                  props.setSettings((settings) => ({
                    ...settings,
                    optimizer: { ...settings.optimizer, removeComments: event.currentTarget.checked }
                  }))
                }
              />
              Remove comments
            </CheckboxField>
            <CheckboxField>
              <FormInput
                type="checkbox"
                data-testid="settings-optimizer-convert-shapes"
                checked={props.settings.optimizer.convertShapes}
                onChange={(event) =>
                  props.setSettings((settings) => ({
                    ...settings,
                    optimizer: { ...settings.optimizer, convertShapes: event.currentTarget.checked }
                  }))
                }
              />
              Convert shapes
            </CheckboxField>
            <CheckboxField>
              <FormInput
                type="checkbox"
                data-testid="settings-optimizer-simplify-path-parameters"
                checked={props.settings.optimizer.simplifyPathParameters}
                onChange={(event) =>
                  props.setSettings((settings) => ({
                    ...settings,
                    optimizer: { ...settings.optimizer, simplifyPathParameters: event.currentTarget.checked }
                  }))
                }
              />
              Simplify paths
            </CheckboxField>
          </Show>
          <Show when={tab() === 'palettes'}>
            <PaletteSettings
              palettes={props.settings.palettes}
              setPalettes={(update) => props.setSettings((settings) => ({ ...settings, palettes: update(settings.palettes) }))}
            />
          </Show>
          <Show when={tab() === 'shortcuts'}>
            <ShortcutTable />
          </Show>
          <Show when={tab() === 'theming'}>
            <SettingsField>
              Theme
              <FormSelect
                value={props.settings.themePreset}
                data-testid="settings-theme-select"
                onChange={(event) =>
                  props.setSettings((settings) =>
                    themePresetSettings(event.currentTarget.value as ThemePreset, settings)
                  )
                }
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="black">Black (OLED)</option>
                <option value="gray">Gray</option>
              </FormSelect>
            </SettingsField>
            <SettingsField>
              Accent
              <FormInput
                type="color"
                data-testid="settings-accent-color"
                value={props.settings.accentColor}
                onInput={(event) =>
                  props.setSettings((settings) => ({ ...settings, accentColor: event.currentTarget.value }))
                }
              />
            </SettingsField>
            <SettingsField>
              Canvas
              <FormInput
                type="color"
                data-testid="settings-canvas-color"
                value={props.settings.canvasColor}
                onInput={(event) =>
                  props.setSettings((settings) => ({ ...settings, canvasColor: event.currentTarget.value }))
                }
              />
            </SettingsField>
            <SettingsField>
              Grid
              <FormInput
                type="color"
                data-testid="settings-grid-color"
                value={props.settings.gridColor}
                onInput={(event) =>
                  props.setSettings((settings) => ({ ...settings, gridColor: event.currentTarget.value }))
                }
              />
            </SettingsField>
          </Show>
          <Show when={tab() === 'tabbar'}>
            <CheckboxField>
              <FormInput
                type="checkbox"
                data-testid="settings-tab-middle-click-close"
                checked={props.settings.tabMiddleClickClose}
                onChange={(event) =>
                  props.setSettings((settings) => ({ ...settings, tabMiddleClickClose: event.currentTarget.checked }))
                }
              />
              Middle click closes tab
            </CheckboxField>
          </Show>
          <Show when={tab() === 'other'}>
            <CheckboxField>
              <FormInput
                type="checkbox"
                data-testid="settings-use-ctrl-for-zoom"
                checked={props.settings.useCtrlForZoom}
                onChange={(event) =>
                  props.setSettings((settings) => ({ ...settings, useCtrlForZoom: event.currentTarget.checked }))
                }
              />
              Ctrl wheel zoom
            </CheckboxField>
            <CheckboxField>
              <FormInput
                type="checkbox"
                data-testid="settings-raster-preview-during-interaction"
                checked={props.settings.rasterPreviewDuringInteraction}
                onChange={(event) =>
                  props.setSettings((settings) => ({
                    ...settings,
                    rasterPreviewDuringInteraction: event.currentTarget.checked
                  }))
                }
              />
              Raster preview while panning or zooming
            </CheckboxField>
          </Show>
        </div>
      </div>
    </ModalFrame>
  );
}

function FormatterSettingsView(props: {
  readonly label: string;
  readonly formatter: FormatterSettings;
  readonly update: (key: keyof FormatterSettings, value: FormatterSettings[keyof FormatterSettings]) => void;
}) {
  const testId = () => `formatter-${testIdSegment(props.label)}`;

  return (
    <fieldset
      class="settings-fieldset grid gap-2 rounded-md border border-[var(--soft-border)] p-2.5"
      data-testid={testId()}
    >
      <legend>{props.label}</legend>
      <SettingsField>
        Preset
        <FormSelect
          value={props.formatter.preset}
          data-testid={`${testId()}-preset`}
          onChange={(event) => props.update('preset', event.currentTarget.value as FormatterPreset)}
        >
          <option value="compact">Compact</option>
          <option value="pretty">Pretty</option>
        </FormSelect>
      </SettingsField>
      <SettingsField>
        Formatting
        <FormSelect
          value={props.formatter.formattingStyle}
          data-testid={`${testId()}-formatting-style`}
          onChange={(event) => props.update('formattingStyle', event.currentTarget.value as FormattingStyle)}
        >
          <option value="compact">Compact</option>
          <option value="pretty">Pretty</option>
          <option value="spacious">Spacious</option>
        </FormSelect>
      </SettingsField>
      <SettingsField>
        Shorthand
        <FormSelect
          value={props.formatter.shorthandTags}
          data-testid={`${testId()}-shorthand-tags`}
          onChange={(event) => props.update('shorthandTags', event.currentTarget.value as ShorthandTags)}
        >
          <option value="always">Always</option>
          <option value="all-except-containers">All except containers</option>
          <option value="never">Never</option>
        </FormSelect>
      </SettingsField>
      <CheckboxField>
        <FormInput
          type="checkbox"
          data-testid={`${testId()}-remove-comments`}
          checked={props.formatter.removeComments}
          onChange={(event) => props.update('removeComments', event.currentTarget.checked)}
        />
        Remove comments
      </CheckboxField>
      <CheckboxField>
        <FormInput
          type="checkbox"
          data-testid={`${testId()}-trailing-newline`}
          checked={props.formatter.trailingNewline}
          onChange={(event) => props.update('trailingNewline', event.currentTarget.checked)}
        />
        Trailing newline
      </CheckboxField>
      <CheckboxField>
        <FormInput
          type="checkbox"
          data-testid={`${testId()}-indent-with-spaces`}
          checked={props.formatter.indentWithSpaces}
          onChange={(event) => props.update('indentWithSpaces', event.currentTarget.checked)}
        />
        Spaces
      </CheckboxField>
      <SettingsField>
        Indent
        <FormInput
          type="number"
          min="0"
          max="16"
          data-testid={`${testId()}-indentation-spaces`}
          value={props.formatter.indentationSpaces}
          onChange={(event) => {
            const spaces = Number.parseInt(event.currentTarget.value, 10);
            props.update('indentationSpaces', Number.isNaN(spaces) ? 2 : clamp(spaces, 0, 16));
          }}
        />
      </SettingsField>
      <div class="mt-1 text-[11px] text-[var(--muted)]">Colors</div>
      <SettingsField>
        Named colors
        <FormSelect
          value={props.formatter.colorUseNamedColors}
          data-testid={`${testId()}-color-named`}
          onChange={(event) =>
            props.update('colorUseNamedColors', event.currentTarget.value as FormatterSettings['colorUseNamedColors'])
          }
        >
          <option value="always">Always</option>
          <option value="when-shorter-or-equal">When shorter or equal</option>
          <option value="when-shorter">When shorter</option>
          <option value="never">Never</option>
        </FormSelect>
      </SettingsField>
      <SettingsField>
        Color syntax
        <FormSelect
          value={props.formatter.colorPrimarySyntax}
          data-testid={`${testId()}-color-syntax`}
          onChange={(event) =>
            props.update('colorPrimarySyntax', event.currentTarget.value as FormatterSettings['colorPrimarySyntax'])
          }
        >
          <option value="three-or-six-digit-hex">3 or 6 digit hex</option>
          <option value="six-digit-hex">6 digit hex</option>
          <option value="rgb">rgb()</option>
        </FormSelect>
      </SettingsField>
      <CheckboxField>
        <FormInput
          type="checkbox"
          data-testid={`${testId()}-colorCapitalHex`}
          checked={props.formatter.colorCapitalHex}
          onChange={(event) => props.update('colorCapitalHex', event.currentTarget.checked)}
        />
        Capital hex
      </CheckboxField>
      <For each={formatterToggleGroups}>
        {(group) => (
          <>
            <div class="mt-1 text-[11px] text-[var(--muted)]">{group.title}</div>
            <For each={group.toggles}>
              {(toggle) => (
                <CheckboxField>
                  <FormInput
                    type="checkbox"
                    data-testid={`${testId()}-${toggle.key}`}
                    checked={props.formatter[toggle.key]}
                    onChange={(event) => props.update(toggle.key, event.currentTarget.checked)}
                  />
                  {toggle.label}
                </CheckboxField>
              )}
            </For>
          </>
        )}
      </For>
    </fieldset>
  );
}

/** GodSVG's number and path data formatter options, shown as checkboxes. */
const formatterToggleGroups = [
  {
    title: 'Numbers',
    toggles: [
      { key: 'numberRemoveLeadingZero', label: 'Remove leading zero' },
      { key: 'numberUseExponentIfShorter', label: 'Use exponent when shorter' }
    ]
  },
  {
    title: 'Path data',
    toggles: [
      { key: 'pathdataCompressNumbers', label: 'Compress numbers' },
      { key: 'pathdataMinimizeSpacing', label: 'Minimize spacing' },
      { key: 'pathdataRemoveSpacingAfterFlags', label: 'Remove spacing after arc flags' },
      { key: 'pathdataRemoveConsecutiveCommands', label: 'Remove repeated commands' }
    ]
  },
  {
    title: 'Transform lists',
    toggles: [
      { key: 'transformListCompressNumbers', label: 'Compress numbers' },
      { key: 'transformListMinimizeSpacing', label: 'Minimize spacing' },
      { key: 'transformListRemoveUnnecessaryParams', label: 'Remove unnecessary parameters' }
    ]
  }
] as const satisfies readonly {
  readonly title: string;
  readonly toggles: readonly { readonly key: keyof FormatterSettings; readonly label: string }[];
}[];

/**
 * GodSVG's export dialog: SVG or PNG/JPG/WebP at a scale (or explicit width/height), with an optional raster
 * background, JPG/WebP quality, and lossless or lossy WebP. Shows the real file size, encoded shortly after the
 * options change, and saves under the tab's name.
 */
export function ExportModal(props: {
  readonly root: SvgElementNode;
  readonly exportText: string;
  /** Name of the exported tab, used for the file name. */
  readonly tabName: string;
  readonly close: () => void;
}) {
  const [format, setFormat] = createSignal<ExportFormat>('svg');
  const [scale, setScale] = createSignal(1);
  const [useBackground, setUseBackground] = createSignal(false);
  const [background, setBackground] = createSignal('#ffffff');
  const [quality, setQuality] = createSignal(0.75);
  const [lossyWebp, setLossyWebp] = createSignal(false);
  const [fileSize, setFileSize] = createSignal<string>();
  const dimensions = createMemo(() => svgSize(props.root));
  const pixels = createMemo(() => rasterSize(dimensions(), scale()));
  const options = createMemo(
    (): ExportOptions => ({
      format: format(),
      scale: scale(),
      background: useBackground() || format() === 'jpeg' ? background() : undefined,
      quality: quality(),
      lossyWebp: lossyWebp()
    })
  );
  const fileName = () => exportFileName(props.tabName, format());
  const hasQuality = () => format() === 'jpeg' || (format() === 'webp' && lossyWebp());
  const setPixelSize = (axis: 'width' | 'height', value: number) => {
    if (Number.isFinite(value) && value > 0) {
      setScale(value / dimensions()[axis]);
    }
  };

  // Encode shortly after the options settle for the real size; a newer run discards older results.
  createEffect(
    () => ({ text: props.exportText, settings: options(), size: dimensions() }),
    ({ text, settings, size }) => {
      let cancelled = false;
      setFileSize(undefined);
      const timer = setTimeout(() => {
        void renderExport(text, size, settings)
          .then((blob) => {
            if (!cancelled) {
              setFileSize(humanFileSize(blob.size));
            }
          })
          .catch(() => undefined);
      }, 300);

      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }
  );

  return (
    <ModalFrame title="Export Configuration" close={props.close}>
      <div
        class="export-modal grid grid-cols-[minmax(260px,1fr)_260px] gap-3 [@media(max-width:820px)]:grid-cols-1"
        data-testid="export-modal-body"
      >
        <div
          class="export-preview min-h-90 rounded-md border border-[var(--soft-border)] bg-[var(--panel-2)] p-2.5 [&>svg]:h-full [&>svg]:w-full"
          data-testid="export-preview"
        >
          <PreviewSvg root={props.root} testId="export-preview-svg" />
        </div>
        <div class="export-controls grid content-start gap-2.5" data-testid="export-controls">
          <SettingsField>
            Format
            <FormSelect
              value={format()}
              data-testid="export-format-select"
              onChange={(event) => setFormat(event.currentTarget.value as ExportFormat)}
            >
              <option value="svg">svg</option>
              <option value="png">png</option>
              <option value="jpeg">jpg</option>
              <option value="webp">webp</option>
            </FormSelect>
          </SettingsField>
          <Show when={format() !== 'svg'}>
            <SettingsField>
              Scale
              <FormInput
                type="number"
                min="0.01"
                step="0.1"
                data-testid="export-scale-input"
                value={Number(scale().toFixed(4))}
                onChange={(event) => setScale(Math.max(0.01, Number.parseFloat(event.currentTarget.value) || 1))}
              />
            </SettingsField>
            <SettingsField>
              Size
              <div class="flex items-center gap-1">
                <FormInput
                  type="number"
                  min="1"
                  aria-label="Width in pixels"
                  data-testid="export-width-input"
                  value={pixels().width}
                  onChange={(event) => setPixelSize('width', Number(event.currentTarget.value))}
                />
                ×
                <FormInput
                  type="number"
                  min="1"
                  aria-label="Height in pixels"
                  data-testid="export-height-input"
                  value={pixels().height}
                  onChange={(event) => setPixelSize('height', Number(event.currentTarget.value))}
                />
              </div>
            </SettingsField>
            <CheckboxField>
              <FormInput
                type="checkbox"
                data-testid="export-background-toggle"
                checked={useBackground() || format() === 'jpeg'}
                disabled={format() === 'jpeg'}
                onChange={(event) => setUseBackground(event.currentTarget.checked)}
              />
              Background
            </CheckboxField>
            <Show when={useBackground() || format() === 'jpeg'}>
              <SettingsField>
                Color
                <FormInput
                  type="color"
                  data-testid="export-background-color"
                  value={background()}
                  onInput={(event) => setBackground(event.currentTarget.value)}
                />
              </SettingsField>
            </Show>
            <Show when={format() === 'webp'}>
              <CheckboxField>
                <FormInput
                  type="checkbox"
                  data-testid="export-webp-lossy"
                  checked={lossyWebp()}
                  onChange={(event) => setLossyWebp(event.currentTarget.checked)}
                />
                Lossy
              </CheckboxField>
            </Show>
            <Show when={hasQuality()}>
              <SettingsField>
                Quality
                <FormInput
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  data-testid="export-quality"
                  value={quality()}
                  onInput={(event) => setQuality(Number(event.currentTarget.value))}
                />
              </SettingsField>
            </Show>
          </Show>
          <div class="export-meta flex justify-between gap-2.5 text-[var(--muted)]" data-testid="export-meta">
            <span data-testid="export-dimensions">
              {format() === 'svg' ? `${dimensions().width}×${dimensions().height}` : `${pixels().width}×${pixels().height} px`}
            </span>
            <span data-testid="export-estimated-size">{fileSize() ?? '…'}</span>
          </div>
          <div class="truncate text-[11px] text-[var(--muted)]" data-testid="export-file-name">
            {fileName()}
          </div>
          <PanelButton
            type="button"
            variant="primary"
            icon={ExportIcon}
            data-testid="export-confirm-button"
            onClick={() => void exportFile(props.exportText, dimensions(), options(), fileName())}
          >
            Export
          </PanelButton>
          <PanelButton
            type="button"
            icon={CopyIcon}
            data-testid="export-copy-button"
            onClick={() => void copyExport(props.exportText, dimensions(), options())}
          >
            Copy
          </PanelButton>
        </div>
      </div>
    </ModalFrame>
  );
}

/** Asks what to do with unsaved changes before a tab closes, like GodSVG's "Save the changes?" dialog. */
export function CloseTabModal(props: {
  readonly tabName: string;
  readonly save: () => void;
  readonly discard: () => void;
  readonly close: () => void;
}) {
  return (
    <ModalFrame title="Save the changes?" close={props.close}>
      <div class="grid gap-3" data-testid="close-tab-dialog">
        <p class="m-0 leading-normal">
          <strong>{props.tabName}</strong> has unsaved changes. Save them before closing the tab?
        </p>
        <div class="flex justify-end gap-2">
          <PanelButton type="button" data-testid="close-tab-cancel" onClick={props.close}>
            Cancel
          </PanelButton>
          <PanelButton type="button" data-testid="close-tab-discard" onClick={props.discard}>
            Don't save
          </PanelButton>
          <PanelButton type="button" variant="primary" data-testid="close-tab-save" onClick={props.save}>
            Save
          </PanelButton>
        </div>
      </div>
    </ModalFrame>
  );
}

export function AboutModal(props: { readonly close: () => void }) {
  return (
    <ModalFrame title="About GodSVG Solid Port" close={props.close}>
      <InfoPanel icon={GodSvgIcon}>
        <p class="m-0 leading-normal">
          GodSVG is a structured SVG editor by MewPurPur. This SolidJS port keeps the same low-abstraction workflow:
          edit SVG elements directly, edit code directly, and keep the output clean.
        </p>
        <p class="m-0 leading-normal">Original project assets and source are MIT licensed.</p>
        <a class="text-[var(--accent)]" href="https://github.com/MewPurPur/GodSVG" target="_blank" rel="noreferrer">
          Repository
        </a>
      </InfoPanel>
    </ModalFrame>
  );
}

export function DonateModal(props: { readonly close: () => void }) {
  return (
    <ModalFrame title="Donate" close={props.close}>
      <InfoPanel icon={HeartIcon}>
        <p class="m-0 leading-normal">Support the original GodSVG project and its ongoing development.</p>
        <a class="text-[var(--accent)]" href="https://godsvg.com" target="_blank" rel="noreferrer">
          GodSVG website
        </a>
      </InfoPanel>
    </ModalFrame>
  );
}

export function ShortcutsModal(props: { readonly close: () => void }) {
  return (
    <ModalFrame title="Shortcuts" close={props.close}>
      <ShortcutTable />
    </ModalFrame>
  );
}

function ShortcutTable() {
  return (
    <table class="shortcut-table w-full border-collapse" data-testid="shortcut-table">
      <tbody>
        <For each={defaultShortcutItems}>
          {(item) => (
            <tr data-testid={`shortcut-row-${testIdSegment(item.category)}-${testIdSegment(item.action)}`}>
              <ShortcutCell>{item.category}</ShortcutCell>
              <ShortcutCell>{item.action}</ShortcutCell>
              <ShortcutCell>
                <Keycap>{item.keys}</Keycap>
              </ShortcutCell>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  );
}

/**
 * Dialog shell: takes keyboard focus when opened and gives it back on close; Escape, the close button, and a press
 * on the backdrop call `close`.
 */
function ModalFrame(props: { readonly title: string; readonly close: () => void; readonly children: JSX.Element }) {
  const modalId = () => `modal-${testIdSegment(props.title)}`;
  let panel: HTMLElement | undefined;

  onSettled(() => {
    const previousFocus = document.activeElement;
    panel?.focus();

    return () => {
      if (previousFocus instanceof HTMLElement) {
        previousFocus.focus();
      }
    };
  });

  createEventListener(window, 'keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      props.close();
    }
  });

  return (
    <div
      class="modal-backdrop fixed inset-0 z-100 grid place-items-center bg-[#0008]"
      data-testid={`${modalId()}-backdrop`}
      onPointerDown={props.close}
    >
      <section
        ref={(element) => (panel = element)}
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        tabindex={-1}
        class="modal-panel grid max-h-[min(760px,calc(100vh-32px))] w-[min(860px,calc(100vw-32px))] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[7px] border border-[var(--border)] bg-[var(--panel)] shadow-[0_20px_60px_#000a] outline-none"
        data-testid={modalId()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header
          class="flex items-center justify-between gap-3 border-b border-[var(--soft-border)] bg-[var(--panel-2)] px-2.5 py-2"
          data-testid={`${modalId()}-header`}
        >
          <h2 class="m-0 text-[15px]" data-testid={`${modalId()}-title`}>
            {props.title}
          </h2>
          <button
            class="grid h-6.5 w-6.5 place-items-center rounded-[5px] border border-[var(--soft-border)] bg-[var(--panel)]"
            type="button"
            data-testid={`${modalId()}-close-button`}
            onClick={props.close}
          >
            <ClearIcon {...decorativeIconProps} />
          </button>
        </header>
        <div class="modal-content min-h-0 overflow-auto p-3" data-testid={`${modalId()}-content`}>
          {props.children}
        </div>
      </section>
    </div>
  );
}

function SettingsField(props: { readonly children: JSX.Element }) {
  return <label class="grid grid-cols-[minmax(120px,auto)_minmax(0,1fr)] items-center gap-2.5">{props.children}</label>;
}

function CheckboxField(props: { readonly children: JSX.Element }) {
  return <label class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2.5">{props.children}</label>;
}

function FormInput(props: JSX.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      class="block h-5.5 min-h-5.5 min-w-0 rounded-[5px] border border-[var(--soft-border)] bg-[#080b12] px-1.25 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]"
    />
  );
}

function FormSelect(props: JSX.SelectHTMLAttributes<HTMLSelectElement> & { readonly children: JSX.Element }) {
  return (
    <select
      {...props}
      class="block h-5.5 min-h-5.5 min-w-0 rounded-[5px] border border-[var(--soft-border)] bg-[#080b12] px-1.25 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]"
    >
      {props.children}
    </select>
  );
}

function ShortcutCell(props: { readonly children: JSX.Element }) {
  return <td class="border-b border-b-[var(--soft-border)] px-2 py-1.5">{props.children}</td>;
}

function Keycap(props: { readonly children: JSX.Element }) {
  return (
    <kbd class="inline-block rounded border border-[var(--soft-border)] bg-[#080b12] px-1.5 py-0.5 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px]">
      {props.children}
    </kbd>
  );
}

function InfoPanel(props: { readonly icon: SvgIcon; readonly children: JSX.Element }) {
  const Icon = props.icon;

  return (
    <div class="about-panel grid max-w-140 justify-items-start gap-2.5" data-testid="info-panel">
      <Icon {...decorativeIconProps} class="about-logo h-14 w-14" />
      {props.children}
    </div>
  );
}

function testIdSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
