import { createSignal, Show } from 'solid-js';

import type { EditorContribution, ViewportToolbarContribution } from '../../editor/kernel';
import { decorativeIconProps } from '../../editor/svg-icon';
import type { AppSettings, DragSelectionMode } from '../../editor/types';
import type { EditorPanelContext } from '../panels/panelRegistry';
import { IconButton } from '../ui/IconButton';
import ClearIcon from '../ui/icons/Clear.svg';
import PlusIcon from '../ui/icons/Plus.svg';
import { MenuButton, MenuLabel } from '../ui/MenuItem';
import ExpandIcon from './icons/Expand.svg';
import FileBrowseIcon from './icons/FileBrowse.svg';
import MinusIcon from './icons/Minus.svg';
import ReferenceIcon from './icons/Reference.svg';
import SnapIcon from './icons/Snap.svg';
import VisualsIcon from './icons/Visuals.svg';

export type ViewportToolbarRegistryContribution = EditorContribution<EditorPanelContext> & {
  readonly viewportToolbars?: readonly ViewportToolbarContribution<EditorPanelContext>[];
};

export const coreViewportToolbarContribution = {
  id: 'core.viewport-toolbar',
  viewportToolbars: [
    {
      id: 'viewport.left-tools',
      placement: 'left',
      order: 10,
      render: (context) => <ViewportLeftToolbarGroup context={context} />
    },
    {
      id: 'viewport.zoom-widget',
      placement: 'right',
      order: 10,
      render: (context) => <ViewportZoomToolbarGroup context={context} />
    }
  ]
} as const satisfies ViewportToolbarRegistryContribution;

function ViewportLeftToolbarGroup(props: { readonly context: EditorPanelContext }) {
  const [visualsOpen, setVisualsOpen] = createSignal(false);
  const [referenceOpen, setReferenceOpen] = createSignal(false);
  const settings = () => props.context.kernel.settings.settings();
  const reference = () => props.context.kernel.ui.referenceImage;
  const hasReference = () => Boolean(reference()?.image());

  return (
    <>
      <IconButton
        icon={VisualsIcon}
        label="Visuals"
        testId="viewport-visuals-button"
        active={visualsOpen()}
        onClick={() => setVisualsOpen(!visualsOpen())}
      />
      <Show when={visualsOpen()}>
        <div
          class="popover viewport-popover absolute top-8 left-1 z-50 grid min-w-47.5 gap-0.5 rounded-md border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_96%,#000)] p-1.25 shadow-[0_12px_28px_#0008]"
          data-testid="viewport-visuals-popover"
        >
          <MenuLabel data-testid="show-grid-toggle">
            <input
              type="checkbox"
              data-testid="show-grid-checkbox"
              checked={settings().showGrid}
              onChange={(event) => updateSettings(props.context, (current) => ({ ...current, showGrid: event.currentTarget.checked }))}
            />
            Grid
          </MenuLabel>
          <MenuLabel data-testid="show-handles-toggle">
            <input
              type="checkbox"
              data-testid="show-handles-checkbox"
              checked={settings().showHandles}
              onChange={(event) => updateSettings(props.context, (current) => ({ ...current, showHandles: event.currentTarget.checked }))}
            />
            Handles
          </MenuLabel>
          <MenuLabel data-testid="view-rasterized-toggle">
            <input
              type="checkbox"
              data-testid="view-rasterized-checkbox"
              checked={settings().viewRasterized}
              onChange={(event) => updateSettings(props.context, (current) => ({ ...current, viewRasterized: event.currentTarget.checked }))}
            />
            Rasterized
          </MenuLabel>
        </div>
      </Show>
      <IconButton
        icon={ReferenceIcon}
        label="Reference"
        testId="viewport-reference-button"
        active={referenceOpen()}
        disabled={!reference()}
        onClick={() => setReferenceOpen(!referenceOpen())}
      />
      <Show when={referenceOpen()}>
        <div
          class="popover viewport-popover absolute top-8 left-1 z-50 grid min-w-47.5 gap-0.5 rounded-md border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_96%,#000)] p-1.25 shadow-[0_12px_28px_#0008]"
          data-testid="viewport-reference-popover"
        >
          <MenuButton type="button" icon={FileBrowseIcon} data-testid="load-reference-button" disabled={!reference()} onClick={() => reference()?.openDialog()}>
            Load reference
          </MenuButton>
          <MenuButton type="button" icon={ClearIcon} data-testid="clear-reference-button" disabled={!hasReference()} onClick={() => reference()?.clear()}>
            Clear reference
          </MenuButton>
          <MenuLabel disabled={!hasReference()} data-testid="show-reference-toggle">
            <input
              type="checkbox"
              data-testid="show-reference-checkbox"
              checked={Boolean(reference()?.show())}
              disabled={!hasReference()}
              onChange={(event) => reference()?.setShow(event.currentTarget.checked)}
            />
            Show
          </MenuLabel>
          <MenuLabel disabled={!hasReference()} data-testid="overlay-reference-toggle">
            <input
              type="checkbox"
              data-testid="overlay-reference-checkbox"
              checked={Boolean(reference()?.overlay())}
              disabled={!hasReference()}
              onChange={(event) => reference()?.setOverlay(event.currentTarget.checked)}
            />
            Overlay
          </MenuLabel>
        </div>
      </Show>
      <button
        class="snap-button inline-grid h-6.5 w-6.5 cursor-pointer place-items-center rounded-[5px] border border-[var(--soft-border)] bg-[var(--panel-2)] p-0 hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_22%,var(--panel-2))] [&.active]:border-[var(--accent)] [&.active]:bg-[color-mix(in_srgb,var(--accent)_22%,var(--panel-2))]"
        type="button"
        classList={{ active: settings().snapEnabled }}
        data-testid="snap-toggle-button"
        onClick={() => updateSettings(props.context, (current) => ({ ...current, snapEnabled: !current.snapEnabled }))}
      >
        <SnapIcon {...decorativeIconProps} />
      </button>
      <input
        class="snap-input block h-6.5 min-h-5.5 w-16 min-w-0 rounded-[5px] border border-[var(--soft-border)] bg-[#080b12] text-center font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]"
        type="number"
        min="0.001"
        step="1"
        name="snap-size"
        aria-label="Snap size"
        data-testid="snap-size-input"
        value={settings().snapSize}
        disabled={!settings().snapEnabled}
        onChange={(event) => updateSettings(props.context, (current) => ({ ...current, snapSize: Math.max(0.001, Number.parseFloat(event.currentTarget.value) || 1) }))}
      />
      <div class="selection-mode-toggle inline-grid grid-flow-col gap-0.5 rounded-[5px] border border-[var(--soft-border)] bg-[color-mix(in_srgb,var(--panel)_74%,#000)] p-0.5" data-testid="selection-mode-toggle">
        <button
          type="button"
          class="h-6 cursor-pointer rounded-[3px] border-0 bg-transparent px-2 py-0 text-[11px] text-[var(--muted)] [&.active]:bg-[color-mix(in_srgb,var(--accent)_24%,var(--panel-2))] [&.active]:text-[var(--text)]"
          classList={{ active: settings().dragSelectionMode === 'intersect' }}
          title="Select touched objects"
          data-testid="selection-mode-intersect-button"
          onClick={() => setDragSelectionMode(props.context, 'intersect')}
        >
          Touch
        </button>
        <button
          type="button"
          class="h-6 cursor-pointer rounded-[3px] border-0 bg-transparent px-2 py-0 text-[11px] text-[var(--muted)] [&.active]:bg-[color-mix(in_srgb,var(--accent)_24%,var(--panel-2))] [&.active]:text-[var(--text)]"
          classList={{ active: settings().dragSelectionMode === 'contain' }}
          title="Select enclosed objects"
          data-testid="selection-mode-contain-button"
          onClick={() => setDragSelectionMode(props.context, 'contain')}
        >
          Inside
        </button>
      </div>
    </>
  );
}

function ViewportZoomToolbarGroup(props: { readonly context: EditorPanelContext }) {
  const viewport = () => props.context.kernel.viewport;
  const fullscreen = () => props.context.kernel.ui.fullscreen;

  return (
    <>
      <IconButton
        icon={ExpandIcon}
        label={fullscreen()?.isFullscreen() ? 'Exit fullscreen' : 'Fullscreen'}
        testId="fullscreen-toggle-button"
        active={Boolean(fullscreen()?.isFullscreen())}
        disabled={!fullscreen()}
        onClick={() => fullscreen()?.toggle()}
      />
      <IconButton icon={MinusIcon} label="Zoom out" testId="zoom-out-button" onClick={() => viewport().zoomBy(1 / Math.SQRT2)} />
      <button
        class="inline-grid h-6.5 w-18 cursor-pointer place-items-center rounded-[5px] border border-[var(--soft-border)] bg-[var(--panel-2)] p-0 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] leading-none hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_22%,var(--panel-2))]"
        type="button"
        data-testid="zoom-reset-button"
        onClick={viewport().centerFrame}
      >
        {Math.round(viewport().zoom() * 100)}%
      </button>
      <IconButton icon={PlusIcon} label="Zoom in" testId="zoom-in-button" onClick={() => viewport().zoomBy(Math.SQRT2)} />
    </>
  );
}

function updateSettings(
  context: EditorPanelContext,
  updater: (settings: AppSettings) => AppSettings
): void {
  context.kernel.settings.setSettings(updater);
}

function setDragSelectionMode(context: EditorPanelContext, mode: DragSelectionMode): void {
  updateSettings(context, (settings) => ({ ...settings, dragSelectionMode: mode }));
}
