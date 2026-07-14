import { createEffect, createMemo, createSignal, For, onMount, Show, type JSX } from "solid-js";

import { createCommandPaletteItems, filterCommandPaletteItems, type CommandPaletteItem } from "../../editor/command-palette";
import type { EditorContributionContext, SettingsSectionContribution } from "../../editor/kernel";
import { decorativeIconProps, type SvgIcon } from "../../editor/svg-icon";
import { humanFileSize, type FormatterPreset, type FormatterSettings, type FormattingStyle, type ShorthandTags } from "../../formatter";
import { copyExport, exportFile } from "../../editor/export-utils";
import { clamp } from "../../editor/tree-utils";
import type { ExportFormat, ShortcutItem } from "../../editor/types";
import { svgSize, type SvgElementNode } from "../../svg-model";
import { PreviewSvg } from "../panels/SidePanels";
import type { EditorPanelContext } from "../panels/panelRegistry";
import ClearIcon from "../ui/icons/Clear.svg";
import CopyIcon from "../ui/icons/Copy.svg";
import ExportIcon from "../ui/icons/Export.svg";
import GodSvgIcon from "../ui/icons/GodSvg.svg";
import HeartIcon from "../ui/icons/Heart.svg";
import { PanelButton } from "../ui/PanelButton";

export function SettingsModal(props: {
  readonly close: () => void;
  readonly sections: readonly SettingsSectionContribution<EditorPanelContext>[];
  readonly context: EditorPanelContext;
}) {
  const sections = createMemo(() => [...props.sections].sort(compareSettingsSections));
  const [tab, setTab] = createSignal<string>();
  const activeSection = createMemo(() => sections().find((section) => section.id === tab()) ?? sections()[0]);

  return (
    <ModalFrame title="Settings" close={props.close}>
      <div class="settings-body grid min-h-120 grid-cols-[150px_minmax(0,1fr)] gap-3 [@media(max-width:820px)]:grid-cols-1" data-testid="settings-body">
        <nav class="settings-tabs grid content-start gap-1" data-testid="settings-tabs">
          <For each={sections()}>
            {(section) => (
              <button
                type="button"
                class="h-7.5 cursor-pointer rounded-[5px] border border-[var(--soft-border)] bg-[var(--panel-2)] text-left text-[var(--text)] capitalize [&.active]:border-[var(--accent)] [&.active]:bg-[color-mix(in_srgb,var(--accent)_18%,var(--panel-2))]"
                classList={{ active: activeSection()?.id === section.id }}
                data-testid={`settings-tab-${section.id}`}
                onClick={() => setTab(section.id)}
              >
                {section.label}
              </button>
            )}
          </For>
        </nav>
        <div class="settings-content grid content-start gap-2.5" data-testid="settings-content">
          <Show when={activeSection()} keyed>
            {(section) => section.render(props.context)}
          </Show>
        </div>
      </div>
    </ModalFrame>
  );
}

function compareSettingsSections(
  first: SettingsSectionContribution<EditorPanelContext>,
  second: SettingsSectionContribution<EditorPanelContext>
): number {
  return (first.order ?? 0) - (second.order ?? 0);
}

export function FormatterSettingsView(props: {
  readonly label: string;
  readonly formatter: FormatterSettings;
  readonly update: (key: keyof FormatterSettings, value: FormatterSettings[keyof FormatterSettings]) => void;
}) {
  const testId = () => `formatter-${testIdSegment(props.label)}`;

  return (
    <fieldset class="settings-fieldset grid gap-2 rounded-md border border-[var(--soft-border)] p-2.5" data-testid={testId()}>
      <legend>{props.label}</legend>
      <SettingsField>
        Preset
        <FormSelect value={props.formatter.preset} data-testid={`${testId()}-preset`} onChange={(event) => props.update("preset", event.currentTarget.value as FormatterPreset)}>
          <option value="compact">Compact</option>
          <option value="pretty">Pretty</option>
        </FormSelect>
      </SettingsField>
      <SettingsField>
        Formatting
        <FormSelect value={props.formatter.formattingStyle} data-testid={`${testId()}-formatting-style`} onChange={(event) => props.update("formattingStyle", event.currentTarget.value as FormattingStyle)}>
          <option value="compact">Compact</option>
          <option value="pretty">Pretty</option>
          <option value="spacious">Spacious</option>
        </FormSelect>
      </SettingsField>
      <SettingsField>
        Shorthand
        <FormSelect value={props.formatter.shorthandTags} data-testid={`${testId()}-shorthand-tags`} onChange={(event) => props.update("shorthandTags", event.currentTarget.value as ShorthandTags)}>
          <option value="always">Always</option>
          <option value="all-except-containers">All except containers</option>
          <option value="never">Never</option>
        </FormSelect>
      </SettingsField>
      <CheckboxField>
        <FormInput type="checkbox" data-testid={`${testId()}-remove-comments`} checked={props.formatter.removeComments} onChange={(event) => props.update("removeComments", event.currentTarget.checked)} />
        Remove comments
      </CheckboxField>
      <CheckboxField>
        <FormInput type="checkbox" data-testid={`${testId()}-trailing-newline`} checked={props.formatter.trailingNewline} onChange={(event) => props.update("trailingNewline", event.currentTarget.checked)} />
        Trailing newline
      </CheckboxField>
      <CheckboxField>
        <FormInput type="checkbox" data-testid={`${testId()}-indent-with-spaces`} checked={props.formatter.indentWithSpaces} onChange={(event) => props.update("indentWithSpaces", event.currentTarget.checked)} />
        Spaces
      </CheckboxField>
      <SettingsField>
        Indent
        <FormInput type="number" min="0" max="16" data-testid={`${testId()}-indentation-spaces`} value={props.formatter.indentationSpaces} onChange={(event) => props.update("indentationSpaces", clamp(Number.parseInt(event.currentTarget.value, 10) || 2, 0, 16))} />
      </SettingsField>
    </fieldset>
  );
}

export function ExportModal(props: {
  readonly root: SvgElementNode;
  readonly exportText: string;
  readonly close: () => void;
}) {
  const [format, setFormat] = createSignal<ExportFormat>("svg");
  const [scale, setScale] = createSignal(1);
  const [background, setBackground] = createSignal("#ffffff");
  const dimensions = createMemo(() => svgSize(props.root));
  const estimatedSize = createMemo(() => {
    if (format() === "svg") {
      return humanFileSize(new Blob([props.exportText]).size);
    }

    return humanFileSize(Math.round(dimensions().width * dimensions().height * scale() * scale() * 0.6));
  });

  return (
    <ModalFrame title="Export Configuration" close={props.close}>
      <div class="export-modal grid grid-cols-[minmax(260px,1fr)_260px] gap-3 [@media(max-width:820px)]:grid-cols-1" data-testid="export-modal-body">
        <div class="export-preview min-h-90 rounded-md border border-[var(--soft-border)] bg-[var(--panel-2)] p-2.5 [&>svg]:h-full [&>svg]:w-full" data-testid="export-preview">
          <PreviewSvg root={props.root} testId="export-preview-svg" />
        </div>
        <div class="export-controls grid content-start gap-2.5" data-testid="export-controls">
          <SettingsField>
            Format
            <FormSelect value={format()} data-testid="export-format-select" onChange={(event) => setFormat(event.currentTarget.value as ExportFormat)}>
              <option value="svg">svg</option>
              <option value="png">png</option>
              <option value="jpeg">jpg</option>
              <option value="webp">webp</option>
            </FormSelect>
          </SettingsField>
          <SettingsField>
            Scale
            <FormInput type="number" min="0.1" step="0.1" data-testid="export-scale-input" value={scale()} onChange={(event) => setScale(Math.max(0.1, Number.parseFloat(event.currentTarget.value) || 1))} />
          </SettingsField>
          <Show when={format() !== "svg"}>
            <SettingsField>
              Background
              <FormInput type="color" data-testid="export-background-color" value={background()} onInput={(event) => setBackground(event.currentTarget.value)} />
            </SettingsField>
          </Show>
          <div class="export-meta flex justify-between gap-2.5 text-[var(--muted)]" data-testid="export-meta">
            <span data-testid="export-dimensions">{dimensions().width}×{dimensions().height}</span>
            <span data-testid="export-estimated-size">{estimatedSize()}</span>
          </div>
          <PanelButton type="button" variant="primary" icon={ExportIcon} data-testid="export-confirm-button" onClick={() => void exportFile(format(), props.exportText, dimensions(), scale(), background())}>
            Export
          </PanelButton>
          <PanelButton type="button" icon={CopyIcon} data-testid="export-copy-button" onClick={() => void copyExport(format(), props.exportText, dimensions(), scale(), background())}>
            Copy
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
        <p class="m-0 leading-normal">GodSVG is a structured SVG editor by MewPurPur. This SolidJS port keeps the same low-abstraction workflow: edit SVG elements directly, edit code directly, and keep the output clean.</p>
        <p class="m-0 leading-normal">Original project assets and source are MIT licensed.</p>
        <a class="text-[var(--accent)]" href="https://github.com/MewPurPur/GodSVG" target="_blank" rel="noreferrer">Repository</a>
      </InfoPanel>
    </ModalFrame>
  );
}

export function DonateModal(props: { readonly close: () => void }) {
  return (
    <ModalFrame title="Donate" close={props.close}>
      <InfoPanel icon={HeartIcon}>
        <p class="m-0 leading-normal">Support the original GodSVG project and its ongoing development.</p>
        <a class="text-[var(--accent)]" href="https://godsvg.com" target="_blank" rel="noreferrer">GodSVG website</a>
      </InfoPanel>
    </ModalFrame>
  );
}

export function ShortcutsModal(props: { readonly close: () => void; readonly shortcutItems: readonly ShortcutItem[] }) {
  return (
    <ModalFrame title="Shortcuts" close={props.close}>
      <ShortcutTable items={props.shortcutItems} />
    </ModalFrame>
  );
}

export function CommandPaletteModal(props: { readonly kernel: EditorContributionContext; readonly close: () => void }) {
  const [query, setQuery] = createSignal("");
  const [activeIndex, setActiveIndex] = createSignal(0);
  const items = createMemo(() => createCommandPaletteItems(props.kernel));
  const filteredItems = createMemo(() => filterCommandPaletteItems(items(), query()));
  let inputRef: HTMLInputElement | undefined;

  createEffect(() => {
    const lastIndex = Math.max(0, filteredItems().length - 1);
    setActiveIndex((index) => Math.min(index, lastIndex));
  });

  onMount(() => inputRef?.focus());

  function runItem(item: CommandPaletteItem | undefined): void {
    if (!item?.enabled) {
      return;
    }

    if (item.run()) {
      props.close();
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      props.close();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(0, filteredItems().length - 1)));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      runItem(filteredItems()[activeIndex()]);
    }
  }

  return (
    <ModalFrame title="Command Palette" close={props.close}>
      <div class="command-palette grid gap-2.5" data-testid="command-palette">
        <input
          ref={inputRef}
          class="h-8 min-w-0 rounded-[5px] border border-[var(--soft-border)] bg-[#080b12] px-2 font-['GodSVG_Mono',ui-monospace,monospace] text-[12px] text-[var(--text)] outline-none focus:border-[var(--accent)] in-[.theme-light]:bg-[#f8fbff]"
          data-testid="command-palette-search"
          value={query()}
          placeholder="Search actions and commands"
          onInput={(event) => {
            setQuery(event.currentTarget.value);
            setActiveIndex(0);
          }}
          onKeyDown={onKeyDown}
        />
        <div class="grid max-h-[min(440px,calc(100vh-180px))] overflow-auto" data-testid="command-palette-results">
          <Show
            when={filteredItems().length > 0}
            fallback={<div class="px-2 py-6 text-center text-[var(--muted)]" data-testid="command-palette-empty">No commands</div>}
          >
            <For each={filteredItems()}>
              {(item, index) => (
                <button
                  type="button"
                  class="grid min-h-10 cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-0 border-b border-b-[var(--soft-border)] bg-transparent px-2 py-1.5 text-left text-[var(--text)] outline-none hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] disabled:cursor-default disabled:text-[var(--muted)] [&.active]:bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]"
                  classList={{ active: activeIndex() === index() }}
                  data-testid={`command-palette-item-${item.kind}-${testIdSegment(item.id)}`}
                  disabled={!item.enabled}
                  onMouseEnter={() => setActiveIndex(index())}
                  onClick={() => runItem(item)}
                >
                  <span class="grid min-w-0 gap-0.5">
                    <span class="overflow-hidden text-ellipsis whitespace-nowrap">{item.label}</span>
                    <span class="overflow-hidden text-ellipsis whitespace-nowrap font-['GodSVG_Mono',ui-monospace,monospace] text-[10px] text-[var(--muted)]">{item.kind}:{item.id}</span>
                  </span>
                  <span class="flex min-w-0 justify-end gap-1">
                    <For each={item.shortcutKeys}>{(keys) => <Keycap>{keys}</Keycap>}</For>
                  </span>
                </button>
              )}
            </For>
          </Show>
        </div>
      </div>
    </ModalFrame>
  );
}

export function ShortcutTable(props: { readonly items: readonly ShortcutItem[] }) {
  return (
    <table class="shortcut-table w-full border-collapse" data-testid="shortcut-table">
      <tbody>
        <For each={props.items}>
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

function ModalFrame(props: { readonly title: string; readonly close: () => void; readonly children: JSX.Element }) {
  const modalId = () => `modal-${testIdSegment(props.title)}`;

  return (
    <div class="modal-backdrop fixed inset-0 z-100 grid place-items-center bg-[#0008]" data-testid={`${modalId()}-backdrop`} onPointerDown={props.close}>
      <section class="modal-panel grid max-h-[min(760px,calc(100vh-32px))] w-[min(860px,calc(100vw-32px))] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[7px] border border-[var(--border)] bg-[var(--panel)] shadow-[0_20px_60px_#000a]" data-testid={modalId()} onPointerDown={(event) => event.stopPropagation()}>
        <header class="flex items-center justify-between gap-3 border-b border-[var(--soft-border)] bg-[var(--panel-2)] px-2.5 py-2" data-testid={`${modalId()}-header`}>
          <h2 class="m-0 text-[15px]" data-testid={`${modalId()}-title`}>{props.title}</h2>
          <button class="grid h-6.5 w-6.5 place-items-center rounded-[5px] border border-[var(--soft-border)] bg-[var(--panel)]" type="button" data-testid={`${modalId()}-close-button`} onClick={props.close}>
            <ClearIcon {...decorativeIconProps} />
          </button>
        </header>
        <div class="modal-content min-h-0 overflow-auto p-3" data-testid={`${modalId()}-content`}>{props.children}</div>
      </section>
    </div>
  );
}

export function SettingsField(props: { readonly children: JSX.Element }) {
  return <label class="grid grid-cols-[minmax(120px,auto)_minmax(0,1fr)] items-center gap-2.5">{props.children}</label>;
}

export function CheckboxField(props: { readonly children: JSX.Element }) {
  return <label class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2.5">{props.children}</label>;
}

export function FormInput(props: JSX.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      class="block h-5.5 min-h-5.5 min-w-0 rounded-[5px] border border-[var(--soft-border)] bg-[#080b12] px-1.25 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]"
    />
  );
}

export function FormSelect(props: JSX.SelectHTMLAttributes<HTMLSelectElement> & { readonly children: JSX.Element }) {
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
  return <kbd class="inline-block rounded border border-[var(--soft-border)] bg-[#080b12] px-1.5 py-0.5 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px]">{props.children}</kbd>;
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
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
