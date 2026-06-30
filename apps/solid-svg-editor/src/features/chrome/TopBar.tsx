import { createSignal, For, Show } from "solid-js";

import type { EditorTab, PanelId } from "../../editor/types";

export function TopBar(props: {
  readonly activeTab: () => EditorTab | undefined;
  readonly tabs: () => readonly EditorTab[];
  readonly activeTabId: () => string;
  readonly fileSize: () => string;
  readonly canUndo: () => boolean;
  readonly canRedo: () => boolean;
  readonly setActiveTabId: (id: string) => void;
  readonly closeTab: (id: string) => void;
  readonly createNewTab: () => void;
  readonly openImportDialog: () => void;
  readonly downloadSvg: () => void;
  readonly copySvgText: () => void;
  readonly undo: () => void;
  readonly redo: () => void;
  readonly optimizeActive: () => void;
  readonly openExport: () => void;
  readonly openSettings: () => void;
  readonly openAbout: () => void;
  readonly openDonate: () => void;
  readonly openShortcuts: () => void;
}) {
  const [moreOpen, setMoreOpen] = createSignal(false);

  return (
    <header class="topbar">
      <div class="global-actions">
        <IconButton icon="/assets/icons/More.svg" label="More" onClick={() => setMoreOpen(!moreOpen())} active={moreOpen()} />
        <Show when={moreOpen()}>
          <div class="popover top-popover">
            <button type="button" onClick={props.openShortcuts}>
              <img src="/assets/icons/ShortcutPanel.svg" alt="" /> Shortcuts
            </button>
            <button type="button" onClick={props.openAbout}>
              <img src="/assets/logos/icon.svg" alt="" /> About
            </button>
            <button type="button" onClick={props.openDonate}>
              <img src="/assets/icons/Heart.svg" alt="" /> Donate
            </button>
            <a href="https://github.com/MewPurPur/GodSVG" target="_blank" rel="noreferrer">
              <img src="/assets/icons/Link.svg" alt="" /> Repository
            </a>
            <a href="https://godsvg.com" target="_blank" rel="noreferrer">
              <img src="/assets/icons/Link.svg" alt="" /> Website
            </a>
          </div>
        </Show>
        <IconButton icon="/assets/icons/Gear.svg" label="Settings" onClick={props.openSettings} />
        <IconButton icon="/assets/icons/Undo.svg" label="Undo" onClick={props.undo} disabled={!props.canUndo()} />
        <IconButton icon="/assets/icons/Redo.svg" label="Redo" onClick={props.redo} disabled={!props.canRedo()} />
        <button class="size-button" type="button" onClick={props.optimizeActive} title="Optimize">
          {props.fileSize()}
        </button>
      </div>
      <div class="tabs-strip">
        <For each={props.tabs()}>
          {(tab) => (
            <div
              role="tab"
              tabIndex={0}
              class="tab-button"
              classList={{ active: props.activeTabId() === tab.id, dirty: tab.dirty }}
              onClick={() => props.setActiveTabId(tab.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  props.setActiveTabId(tab.id);
                }
              }}
              onAuxClick={(event) => {
                if (event.button === 1) {
                  props.closeTab(tab.id);
                }
              }}
            >
              <span>{tab.name}</span>
              <button
                type="button"
                class="tab-close"
                onClick={(event) => {
                  event.stopPropagation();
                  props.closeTab(tab.id);
                }}
              >
                ×
              </button>
            </div>
          )}
        </For>
        <IconButton icon="/assets/icons/CreateTab.svg" label="New tab" onClick={props.createNewTab} />
      </div>
      <div class="file-actions">
        <button class="toolbar-action" type="button" onClick={props.openImportDialog}>
          <img src="/assets/icons/Import.svg" alt="" /> Import
        </button>
        <IconButton icon="/assets/icons/Save.svg" label="Save SVG" onClick={props.downloadSvg} />
        <IconButton icon="/assets/icons/Copy.svg" label="Copy SVG text" onClick={props.copySvgText} />
        <IconButton icon="/assets/icons/Export.svg" label="Export" onClick={props.openExport} />
      </div>
    </header>
  );
}

export function IconButton(props: {
  readonly icon: string;
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly active?: boolean;
}) {
  return (
    <button type="button" class="icon-button" classList={{ active: props.active }} title={props.label} aria-label={props.label} disabled={props.disabled} onClick={props.onClick}>
      <img src={props.icon} alt="" />
    </button>
  );
}

export function PanelTabs(props: { readonly activePanel: () => PanelId; readonly setActivePanel: (panel: PanelId) => void }) {
  const panels = [
    { id: "inspector", label: "Inspector", icon: "/assets/icons/Inspector.svg" },
    { id: "code", label: "Code editor", icon: "/assets/icons/TextFile.svg" },
    { id: "previews", label: "Previews", icon: "/assets/icons/Previews.svg" },
    { id: "debug", label: "Debug", icon: "/assets/icons/Debug.svg" }
  ] as const satisfies readonly { readonly id: PanelId; readonly label: string; readonly icon: string }[];

  return (
    <div class="panel-tabs">
      <For each={panels}>
        {(panel) => (
          <button type="button" classList={{ active: props.activePanel() === panel.id }} onClick={() => props.setActivePanel(panel.id)}>
            <img src={panel.icon} alt="" />
            <span>{panel.label}</span>
          </button>
        )}
      </For>
    </div>
  );
}
