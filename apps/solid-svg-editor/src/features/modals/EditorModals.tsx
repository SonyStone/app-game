import { createEventListener } from '@solid-primitives/event-listener';
import type { JSX } from '@solidjs/web';
import { createEffect, createMemo, createSignal, For, onSettled, Show } from 'solid-js';

import { copyExport, exportFile, exportFileName, rasterSize, renderExport, type ExportOptions } from '../../editor/export-utils';
import { decorativeIconProps, type SvgIcon } from '../../editor/svg-icon';
import { clamp, themePresetSettings } from '../../editor/tree-utils';
import type { AppSettings, ExportFormat, ShortcutBinding, ThemePreset } from '../../editor/types';
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
import { ShortcutEditor } from '../shortcuts/ShortcutEditor';
import type { ShortcutDescriptor } from '../shortcuts/shortcutRegistry';
import ClearIcon from '../ui/icons/Clear.svg';
import CopyIcon from '../ui/icons/Copy.svg';
import ExportIcon from '../ui/icons/Export.svg';
import GodSvgIcon from '../ui/icons/GodSvg.svg';
import HeartIcon from '../ui/icons/Heart.svg';
import type { ImportReview } from '../import/createImportReview';
import { PanelButton } from '../ui/PanelButton';
import { useI18n } from '../../i18n/I18nProvider';
import { LanguageSelect } from '../../i18n/LanguageSelect';

export function SettingsModal(props: {
  readonly settings: AppSettings;
  readonly setSettings: (setter: (settings: AppSettings) => AppSettings) => void;
  readonly close: () => void;
  readonly reformatActiveCode: (formatter?: FormatterSettings) => void;
  readonly shortcuts: ShortcutEditorProps;
}) {
  const { t } = useI18n();
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
          <LanguageSelect
            value={props.settings.language}
            onChange={(language) => props.setSettings((settings) => ({ ...settings, language }))}
          />
          <For each={['formatting', 'optimizer', 'palettes', 'shortcuts', 'theming', 'tabbar', 'other'] as const}>
            {(item) => (
              <button
                type="button"
                class={[
                  'h-7.5 cursor-pointer rounded-[5px] border border-[var(--soft-border)] bg-[var(--panel-2)] px-2 text-left text-[var(--text)] [&.active]:border-[var(--accent)] [&.active]:bg-[color-mix(in_srgb,var(--accent)_18%,var(--panel-2))]',
                  { active: tab() === item }
                ]}
                data-testid={`settings-tab-${item}`}
                onClick={() => setTab(item)}
              >
                {t(settingsTabLabels[item])}
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
              {t('Remove comments')}
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
              {t('Convert shapes')}
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
              {t('Simplify paths')}
            </CheckboxField>
          </Show>
          <Show when={tab() === 'palettes'}>
            <PaletteSettings
              palettes={props.settings.palettes}
              setPalettes={(update) => props.setSettings((settings) => ({ ...settings, palettes: update(settings.palettes) }))}
            />
          </Show>
          <Show when={tab() === 'shortcuts'}>
            <ShortcutEditor {...props.shortcuts} />
          </Show>
          <Show when={tab() === 'theming'}>
            <SettingsField>
              {t('Theme preset')}
              <FormSelect
                value={props.settings.themePreset}
                data-testid="settings-theme-select"
                onChange={(event) =>
                  props.setSettings((settings) =>
                    themePresetSettings(event.currentTarget.value as ThemePreset, settings)
                  )
                }
              >
                <option value="dark">{t('Dark')}</option>
                <option value="light">{t('Light')}</option>
                <option value="black">{t('Black (OLED)')}</option>
                <option value="gray">{t('Gray')}</option>
              </FormSelect>
            </SettingsField>
            <SettingsField>
              {t('Accent color')}
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
              {t('Canvas color')}
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
              {t('Grid color')}
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
              {t('Close tabs with middle mouse button')}
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
              {t('Use CTRL for zooming')}
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

/** GodSVG's names for the settings tabs. */
const settingsTabLabels = {
  formatting: 'Formatting',
  optimizer: 'Optimizer',
  palettes: 'Palettes',
  shortcuts: 'Shortcuts',
  theming: 'Theming',
  tabbar: 'Tab bar',
  other: 'Other'
} as const;

function FormatterSettingsView(props: {
  readonly label: string;
  readonly formatter: FormatterSettings;
  readonly update: (key: keyof FormatterSettings, value: FormatterSettings[keyof FormatterSettings]) => void;
}) {
  const { t } = useI18n();
  const testId = () => `formatter-${testIdSegment(props.label)}`;

  return (
    <fieldset
      class="settings-fieldset grid gap-2 rounded-md border border-[var(--soft-border)] p-2.5"
      data-testid={testId()}
    >
      <legend>{t(props.label)}</legend>
      <SettingsField>
        {t('Preset')}
        <FormSelect
          value={props.formatter.preset}
          data-testid={`${testId()}-preset`}
          onChange={(event) => props.update('preset', event.currentTarget.value as FormatterPreset)}
        >
          <option value="compact">{t('Compact')}</option>
          <option value="pretty">{t('Pretty')}</option>
        </FormSelect>
      </SettingsField>
      <SettingsField>
        {t('Formatting style')}
        <FormSelect
          value={props.formatter.formattingStyle}
          data-testid={`${testId()}-formatting-style`}
          onChange={(event) => props.update('formattingStyle', event.currentTarget.value as FormattingStyle)}
        >
          <option value="compact">{t('Compact')}</option>
          <option value="pretty">{t('Pretty')}</option>
          <option value="spacious">Spacious</option>
        </FormSelect>
      </SettingsField>
      <SettingsField>
        {t('Use shorthand tag syntax')}
        <FormSelect
          value={props.formatter.shorthandTags}
          data-testid={`${testId()}-shorthand-tags`}
          onChange={(event) => props.update('shorthandTags', event.currentTarget.value as ShorthandTags)}
        >
          <option value="always">{t('Always')}</option>
          <option value="all-except-containers">{t('All except containers')}</option>
          <option value="never">{t('Never')}</option>
        </FormSelect>
      </SettingsField>
      <CheckboxField>
        <FormInput
          type="checkbox"
          data-testid={`${testId()}-remove-comments`}
          checked={props.formatter.removeComments}
          onChange={(event) => props.update('removeComments', event.currentTarget.checked)}
        />
        {t('Remove comments')}
      </CheckboxField>
      <CheckboxField>
        <FormInput
          type="checkbox"
          data-testid={`${testId()}-trailing-newline`}
          checked={props.formatter.trailingNewline}
          onChange={(event) => props.update('trailingNewline', event.currentTarget.checked)}
        />
        {t('Add trailing newline')}
      </CheckboxField>
      <CheckboxField>
        <FormInput
          type="checkbox"
          data-testid={`${testId()}-indent-with-spaces`}
          checked={props.formatter.indentWithSpaces}
          onChange={(event) => props.update('indentWithSpaces', event.currentTarget.checked)}
        />
        {t('Use spaces instead of tabs')}
      </CheckboxField>
      <SettingsField>
        {t('Number of indentation spaces')}
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
      <div class="mt-1 text-[11px] text-[var(--muted)]">{t('Colors')}</div>
      <SettingsField>
        {t('Use named colors')}
        <FormSelect
          value={props.formatter.colorUseNamedColors}
          data-testid={`${testId()}-color-named`}
          onChange={(event) =>
            props.update('colorUseNamedColors', event.currentTarget.value as FormatterSettings['colorUseNamedColors'])
          }
        >
          <option value="always">{t('Always')}</option>
          <option value="when-shorter-or-equal">{t('When shorter or equal')}</option>
          <option value="when-shorter">{t('When shorter')}</option>
          <option value="never">{t('Never')}</option>
        </FormSelect>
      </SettingsField>
      <SettingsField>
        {t('Primary syntax')}
        <FormSelect
          value={props.formatter.colorPrimarySyntax}
          data-testid={`${testId()}-color-syntax`}
          onChange={(event) =>
            props.update('colorPrimarySyntax', event.currentTarget.value as FormatterSettings['colorPrimarySyntax'])
          }
        >
          <option value="three-or-six-digit-hex">{t('3-digit or 6-digit hex')}</option>
          <option value="six-digit-hex">{t('6-digit hex')}</option>
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
        {t('Capitalize hexadecimal letters')}
      </CheckboxField>
      <For each={formatterToggleGroups}>
        {(group) => (
          <>
            <div class="mt-1 text-[11px] text-[var(--muted)]">{t(group.title)}</div>
            <For each={group.toggles}>
              {(toggle) => (
                <CheckboxField>
                  <FormInput
                    type="checkbox"
                    data-testid={`${testId()}-${toggle.key}`}
                    checked={props.formatter[toggle.key]}
                    onChange={(event) => props.update(toggle.key, event.currentTarget.checked)}
                  />
                  {t(toggle.label)}
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
      { key: 'numberUseExponentIfShorter', label: 'Use exponential when shorter' }
    ]
  },
  {
    title: 'Pathdata',
    toggles: [
      { key: 'pathdataCompressNumbers', label: 'Compress numbers' },
      { key: 'pathdataMinimizeSpacing', label: 'Minimize spacing' },
      { key: 'pathdataRemoveSpacingAfterFlags', label: 'Remove spacing after flags' },
      { key: 'pathdataRemoveConsecutiveCommands', label: 'Remove consecutive commands' }
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
  const { t } = useI18n();
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
          class="export-preview h-90 rounded-md border border-[var(--soft-border)] bg-[var(--panel-2)] p-2.5"
          data-testid="export-preview"
        >
          <PreviewSvg root={props.root} testId="export-preview-svg" class="block h-full w-full" />
        </div>
        <div class="export-controls grid content-start gap-2.5" data-testid="export-controls">
          <SettingsField>
            {t('Format')}
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
              {t('Scale')}
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
              {t('Size')}
              <div class="flex items-center gap-1">
                <FormInput
                  type="number"
                  min="1"
                  aria-label={t('Width')}
                  data-testid="export-width-input"
                  value={pixels().width}
                  onChange={(event) => setPixelSize('width', Number(event.currentTarget.value))}
                />
                ×
                <FormInput
                  type="number"
                  min="1"
                  aria-label={t('Height')}
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
              {t('Background')}
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
                {t('Lossy')}
              </CheckboxField>
            </Show>
            <Show when={hasQuality()}>
              <SettingsField>
                {t('Quality')}
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
            <span title={t('Estimated size')} data-testid="export-estimated-size">{fileSize() ?? '…'}</span>
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
            {t('Export')}
          </PanelButton>
          <PanelButton
            type="button"
            icon={CopyIcon}
            data-testid="export-copy-button"
            onClick={() => void copyExport(props.exportText, dimensions(), options())}
          >
            {t('Copy')}
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
  const { t } = useI18n();
  return (
    <ModalFrame title="Save the changes?" close={props.close}>
      <div class="grid gap-3" data-testid="close-tab-dialog">
        <p class="m-0 leading-normal">
          {t('Do you want to save the changes made to {file_name}?', { file_name: props.tabName })}{' '}
          {t("Your changes will be lost if you don't save them.")}
        </p>
        <div class="flex justify-end gap-2">
          <PanelButton type="button" data-testid="close-tab-cancel" onClick={props.close}>
            {t('Cancel')}
          </PanelButton>
          <PanelButton type="button" data-testid="close-tab-discard" onClick={props.discard}>
            {t('Don\'t save')}
          </PanelButton>
          <PanelButton type="button" variant="primary" data-testid="close-tab-save" onClick={props.save}>
            {t('Save')}
          </PanelButton>
        </div>
      </div>
    </ModalFrame>
  );
}

/**
 * GodSVG's "Import Problems" dialog: a preview of the SVG as the editor will show it, and either the syntax error or
 * the element and attribute names GodSVG doesn't recognize. Import opens it anyway; Cancel, Escape, and the backdrop
 * drop it.
 */
export function ImportProblemsModal(props: { readonly review: ImportReview; readonly resolve: (accept: boolean) => void }) {
  const { t } = useI18n();

  return (
    <ModalFrame title="Import Problems" close={() => props.resolve(false)}>
      <div class="grid gap-3" data-testid="import-problems">
        <Show when={props.review.root}>
          {(root) => (
            <div class="h-40 rounded-md border border-[var(--soft-border)] bg-[var(--panel-2)] p-2">
              <PreviewSvg root={root()} testId="import-problems-preview" class="block h-full w-full" />
            </div>
          )}
        </Show>
        <Show
          when={props.review.syntaxError}
          fallback={
            <ul class="m-0 grid list-none gap-1 p-0 text-[var(--warning)]" data-testid="import-problems-list">
              <For each={props.review.unrecognizedElements}>
                {(name) => (
                  <li>
                    {t('Unrecognized element')}: <code class="font-['GodSVG_Mono',ui-monospace,monospace]">{name}</code>
                  </li>
                )}
              </For>
              <For each={props.review.unrecognizedAttributes}>
                {(name) => (
                  <li>
                    {t('Unrecognized attribute')}: <code class="font-['GodSVG_Mono',ui-monospace,monospace]">{name}</code>
                  </li>
                )}
              </For>
            </ul>
          }
        >
          {(error) => (
            <p class="m-0 text-center text-[var(--danger)]" data-testid="import-problems-syntax-error">
              {t('Syntax error')}: {t(error())}
            </p>
          )}
        </Show>
        <div class="flex justify-end gap-2">
          <PanelButton type="button" data-testid="import-problems-cancel" onClick={() => props.resolve(false)}>
            {t('Cancel')}
          </PanelButton>
          <PanelButton type="button" variant="primary" data-testid="import-problems-import" onClick={() => props.resolve(true)}>
            {t('Import')}
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
  const { t } = useI18n();

  return (
    <ModalFrame title="Donate…" close={props.close}>
      <InfoPanel icon={HeartIcon}>
        <p class="m-0 leading-normal">Support the original GodSVG project and its ongoing development.</p>
        <a class="text-[var(--accent)]" href="https://godsvg.com" target="_blank" rel="noreferrer">
          {t('GodSVG website')}
        </a>
      </InfoPanel>
    </ModalFrame>
  );
}

/** The shortcut list from the Help menu; bindings can be edited here as in the Settings tab. */
export function ShortcutsModal(props: { readonly close: () => void; readonly shortcuts: ShortcutEditorProps }) {
  return (
    <ModalFrame title="Shortcuts" close={props.close}>
      <ShortcutEditor {...props.shortcuts} />
    </ModalFrame>
  );
}

/** The editor's shortcut actions and the setter for user bindings (`undefined` restores the defaults). */
type ShortcutEditorProps = {
  readonly descriptors: readonly ShortcutDescriptor[];
  readonly setBindings: (id: string, bindings: readonly ShortcutBinding[] | undefined) => void;
};

/**
 * Dialog shell: takes keyboard focus when opened and gives it back on close; Escape, the close button, and a press
 * on the backdrop call `close`.
 */
function ModalFrame(props: { readonly title: string; readonly close: () => void; readonly children: JSX.Element }) {
  const { t } = useI18n();
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
        aria-label={t(props.title)}
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
            {t(props.title)}
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
      class="block h-5.5 min-h-5.5 min-w-0 rounded-[5px] border border-[var(--soft-border)] bg-[#080b12] px-1.25 text-[11px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]"
    >
      {props.children}
    </select>
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
