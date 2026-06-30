import { createMemo, createSignal, For, Show, type JSX } from "solid-js";

import { humanFileSize, type FormatterPreset, type FormatterSettings, type FormattingStyle, type ShorthandTags } from "../../formatter";
import { copyExport, exportFile } from "../../editor/export-utils";
import { shortcutItems } from "../../editor/defaults";
import { clamp, themePresetSettings } from "../../editor/tree-utils";
import type { AppSettings, ExportFormat, ThemePreset } from "../../editor/types";
import { svgSize, type SvgElementNode } from "../../svg-model";
import { PreviewSvg } from "../panels/SidePanels";

export function SettingsModal(props: {
  readonly settings: () => AppSettings;
  readonly setSettings: (setter: (settings: AppSettings) => AppSettings) => void;
  readonly close: () => void;
  readonly reformatActiveCode: (formatter?: FormatterSettings) => void;
}) {
  const [tab, setTab] = createSignal<"formatting" | "optimizer" | "palettes" | "shortcuts" | "theming" | "tabbar" | "other">("formatting");
  const updateFormatter = (key: keyof FormatterSettings, value: FormatterSettings[keyof FormatterSettings], exportFormatter = false) => {
    props.setSettings((settings) => {
      const formatter = { ...(exportFormatter ? settings.exportFormatter : settings.formatter), [key]: value } satisfies FormatterSettings;
      return exportFormatter ? { ...settings, exportFormatter: formatter } : { ...settings, formatter };
    });
  };

  return (
    <ModalFrame title="Settings" close={props.close}>
      <div class="settings-body">
        <nav class="settings-tabs">
          <For each={["formatting", "optimizer", "palettes", "shortcuts", "theming", "tabbar", "other"] as const}>
            {(item) => (
              <button type="button" classList={{ active: tab() === item }} onClick={() => setTab(item)}>
                {item}
              </button>
            )}
          </For>
        </nav>
        <div class="settings-content">
          <Show when={tab() === "formatting"}>
            <FormatterSettingsView label="Editor formatter" formatter={() => props.settings().formatter} update={(key, value) => updateFormatter(key, value)} />
            <FormatterSettingsView label="Export formatter" formatter={() => props.settings().exportFormatter} update={(key, value) => updateFormatter(key, value, true)} />
            <button type="button" onClick={() => props.reformatActiveCode(props.settings().formatter)}>
              Apply editor formatter
            </button>
          </Show>
          <Show when={tab() === "optimizer"}>
            <label>
              <input type="checkbox" checked={props.settings().optimizer.removeComments} onChange={(event) => props.setSettings((settings) => ({ ...settings, optimizer: { ...settings.optimizer, removeComments: event.currentTarget.checked } }))} />
              Remove comments
            </label>
            <label>
              <input type="checkbox" checked={props.settings().optimizer.convertShapes} onChange={(event) => props.setSettings((settings) => ({ ...settings, optimizer: { ...settings.optimizer, convertShapes: event.currentTarget.checked } }))} />
              Convert shapes
            </label>
            <label>
              <input type="checkbox" checked={props.settings().optimizer.simplifyPathParameters} onChange={(event) => props.setSettings((settings) => ({ ...settings, optimizer: { ...settings.optimizer, simplifyPathParameters: event.currentTarget.checked } }))} />
              Simplify path parameters
            </label>
          </Show>
          <Show when={tab() === "palettes"}>
            <div class="palette-list">
              <For each={props.settings().palettes}>
                {(color, index) => (
                  <input
                    type="color"
                    value={color}
                    onInput={(event) =>
                      props.setSettings((settings) => ({
                        ...settings,
                        palettes: settings.palettes.map((item, itemIndex) => (itemIndex === index() ? event.currentTarget.value : item))
                      }))
                    }
                  />
                )}
              </For>
            </div>
          </Show>
          <Show when={tab() === "shortcuts"}>
            <ShortcutTable />
          </Show>
          <Show when={tab() === "theming"}>
            <label>
              Theme
              <select value={props.settings().themePreset} onChange={(event) => props.setSettings((settings) => themePresetSettings(event.currentTarget.value as ThemePreset, settings))}>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="black">Black (OLED)</option>
                <option value="gray">Gray</option>
              </select>
            </label>
            <label>
              Accent
              <input type="color" value={props.settings().accentColor} onInput={(event) => props.setSettings((settings) => ({ ...settings, accentColor: event.currentTarget.value }))} />
            </label>
            <label>
              Canvas
              <input type="color" value={props.settings().canvasColor} onInput={(event) => props.setSettings((settings) => ({ ...settings, canvasColor: event.currentTarget.value }))} />
            </label>
            <label>
              Grid
              <input type="color" value={props.settings().gridColor} onInput={(event) => props.setSettings((settings) => ({ ...settings, gridColor: event.currentTarget.value }))} />
            </label>
          </Show>
          <Show when={tab() === "tabbar"}>
            <label>
              <input type="checkbox" checked={props.settings().tabMiddleClickClose} onChange={(event) => props.setSettings((settings) => ({ ...settings, tabMiddleClickClose: event.currentTarget.checked }))} />
              Middle click closes tab
            </label>
          </Show>
          <Show when={tab() === "other"}>
            <label>
              <input type="checkbox" checked={props.settings().useCtrlForZoom} onChange={(event) => props.setSettings((settings) => ({ ...settings, useCtrlForZoom: event.currentTarget.checked }))} />
              Ctrl wheel zoom
            </label>
            <label>
              <input
                type="checkbox"
                checked={props.settings().rasterPreviewDuringInteraction}
                onChange={(event) => props.setSettings((settings) => ({ ...settings, rasterPreviewDuringInteraction: event.currentTarget.checked }))}
              />
              Raster preview while panning or zooming
            </label>
          </Show>
        </div>
      </div>
    </ModalFrame>
  );
}

function FormatterSettingsView(props: {
  readonly label: string;
  readonly formatter: () => FormatterSettings;
  readonly update: (key: keyof FormatterSettings, value: FormatterSettings[keyof FormatterSettings]) => void;
}) {
  return (
    <fieldset class="settings-fieldset">
      <legend>{props.label}</legend>
      <label>
        Preset
        <select value={props.formatter().preset} onChange={(event) => props.update("preset", event.currentTarget.value as FormatterPreset)}>
          <option value="compact">Compact</option>
          <option value="pretty">Pretty</option>
        </select>
      </label>
      <label>
        Formatting
        <select value={props.formatter().formattingStyle} onChange={(event) => props.update("formattingStyle", event.currentTarget.value as FormattingStyle)}>
          <option value="compact">Compact</option>
          <option value="pretty">Pretty</option>
          <option value="spacious">Spacious</option>
        </select>
      </label>
      <label>
        Shorthand
        <select value={props.formatter().shorthandTags} onChange={(event) => props.update("shorthandTags", event.currentTarget.value as ShorthandTags)}>
          <option value="always">Always</option>
          <option value="all-except-containers">All except containers</option>
          <option value="never">Never</option>
        </select>
      </label>
      <label>
        <input type="checkbox" checked={props.formatter().removeComments} onChange={(event) => props.update("removeComments", event.currentTarget.checked)} />
        Remove comments
      </label>
      <label>
        <input type="checkbox" checked={props.formatter().trailingNewline} onChange={(event) => props.update("trailingNewline", event.currentTarget.checked)} />
        Trailing newline
      </label>
      <label>
        <input type="checkbox" checked={props.formatter().indentWithSpaces} onChange={(event) => props.update("indentWithSpaces", event.currentTarget.checked)} />
        Spaces
      </label>
      <label>
        Indent
        <input type="number" min="0" max="16" value={props.formatter().indentationSpaces} onChange={(event) => props.update("indentationSpaces", clamp(Number.parseInt(event.currentTarget.value, 10) || 2, 0, 16))} />
      </label>
    </fieldset>
  );
}

export function ExportModal(props: {
  readonly root: () => SvgElementNode;
  readonly exportText: () => string;
  readonly close: () => void;
}) {
  const [format, setFormat] = createSignal<ExportFormat>("svg");
  const [scale, setScale] = createSignal(1);
  const [background, setBackground] = createSignal("#ffffff");
  const dimensions = createMemo(() => svgSize(props.root()));
  const estimatedSize = createMemo(() => {
    if (format() === "svg") {
      return humanFileSize(new Blob([props.exportText()]).size);
    }

    return humanFileSize(Math.round(dimensions().width * dimensions().height * scale() * scale() * 0.6));
  });

  return (
    <ModalFrame title="Export Configuration" close={props.close}>
      <div class="export-modal">
        <div class="export-preview">
          <PreviewSvg root={props.root()} />
        </div>
        <div class="export-controls">
          <label>
            Format
            <select value={format()} onChange={(event) => setFormat(event.currentTarget.value as ExportFormat)}>
              <option value="svg">svg</option>
              <option value="png">png</option>
              <option value="jpeg">jpg</option>
              <option value="webp">webp</option>
            </select>
          </label>
          <label>
            Scale
            <input type="number" min="0.1" step="0.1" value={scale()} onChange={(event) => setScale(Math.max(0.1, Number.parseFloat(event.currentTarget.value) || 1))} />
          </label>
          <Show when={format() !== "svg"}>
            <label>
              Background
              <input type="color" value={background()} onInput={(event) => setBackground(event.currentTarget.value)} />
            </label>
          </Show>
          <div class="export-meta">
            <span>{dimensions().width}×{dimensions().height}</span>
            <span>{estimatedSize()}</span>
          </div>
          <button type="button" class="primary-action" onClick={() => void exportFile(format(), props.exportText(), dimensions(), scale(), background())}>
            <img src="/assets/icons/Export.svg" alt="" /> Export
          </button>
          <button type="button" onClick={() => void copyExport(format(), props.exportText(), dimensions(), scale(), background())}>
            <img src="/assets/icons/Copy.svg" alt="" /> Copy
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}

export function AboutModal(props: { readonly close: () => void }) {
  return (
    <ModalFrame title="About GodSVG Solid Port" close={props.close}>
      <div class="about-panel">
        <img class="about-logo" src="/assets/logos/icon.svg" alt="" />
        <p>GodSVG is a structured SVG editor by MewPurPur. This SolidJS port keeps the same low-abstraction workflow: edit SVG elements directly, edit code directly, and keep the output clean.</p>
        <p>Original project assets and source are MIT licensed.</p>
        <a href="https://github.com/MewPurPur/GodSVG" target="_blank" rel="noreferrer">Repository</a>
      </div>
    </ModalFrame>
  );
}

export function DonateModal(props: { readonly close: () => void }) {
  return (
    <ModalFrame title="Donate" close={props.close}>
      <div class="about-panel">
        <img class="about-logo" src="/assets/icons/Heart.svg" alt="" />
        <p>Support the original GodSVG project and its ongoing development.</p>
        <a href="https://godsvg.com" target="_blank" rel="noreferrer">GodSVG website</a>
      </div>
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
    <table class="shortcut-table">
      <tbody>
        <For each={shortcutItems}>
          {(item) => (
            <tr>
              <td>{item.category}</td>
              <td>{item.action}</td>
              <td>
                <kbd>{item.keys}</kbd>
              </td>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  );
}

function ModalFrame(props: { readonly title: string; readonly close: () => void; readonly children: JSX.Element }) {
  return (
    <div class="modal-backdrop" onPointerDown={props.close}>
      <section class="modal-panel" onPointerDown={(event) => event.stopPropagation()}>
        <header>
          <h2>{props.title}</h2>
          <button type="button" onClick={props.close}>
            <img src="/assets/icons/Clear.svg" alt="" />
          </button>
        </header>
        <div class="modal-content">{props.children}</div>
      </section>
    </div>
  );
}
