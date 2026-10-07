import { createMemo, For, Show } from "solid-js";
import type { PointerStateWithActive } from '@solid-primitives/pointer';

import type { EditorCommandEvent } from "../../editor/commands";
import { decorativeIconProps } from "../../editor/svg-icon";
import { humanFileSize } from "../../formatter";
import { nodeLabel, svgSize, type SvgElementNode, type SvgNode } from "../../svg-model";
import CopyIcon from "../ui/icons/Copy.svg";
import WarningIcon from "../ui/icons/Warning.svg";
import { PanelButton } from "../ui/PanelButton";
import { CodeEditor } from "../code-editor/CodeEditor";
import { IconPreviews } from "./IconPreviews";
import { SvgNodeList, SvgNodeView, SvgRootPresentation } from "../viewport/svg-renderer";
import { useI18n } from '../../i18n/I18nProvider';
import { createDebugMeter } from './createDebugMeter';

export function CodePanel(props: {
  readonly code: string;
  readonly parseError: string | undefined;
  readonly applyCode: (text: string) => void;
  readonly reformatPretty: () => void;
  readonly reformatCompact: () => void;
  readonly copySvgText: () => void;
}) {
  const { t } = useI18n();
  return (
    <section class="panel code-panel grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-md border border-[var(--soft-border)] bg-[var(--panel)]" data-testid="code-panel">
      <div class="code-toolbar flex gap-1.5 border-b border-[var(--soft-border)] bg-[var(--panel-2)] p-1.5" data-testid="code-toolbar">
        <PanelButton type="button" icon={CopyIcon} data-testid="code-copy-button" onClick={props.copySvgText}>
          {t('Copy')}
        </PanelButton>
        <PanelButton type="button" data-testid="code-format-pretty-button" onClick={props.reformatPretty}>
          {t('Pretty')}
        </PanelButton>
        <PanelButton type="button" data-testid="code-format-compact-button" onClick={props.reformatCompact}>
          {t('Compact')}
        </PanelButton>
      </div>
      <CodeEditor value={props.code} onInput={props.applyCode} testId="svg-code-textarea" label="SVG code" />
      <Show when={props.parseError}>
        {(message) => (
          <div class="error-bar flex items-center gap-1.75 border-t border-t-[color-mix(in_srgb,var(--danger)_36%,var(--soft-border))] bg-[color-mix(in_srgb,var(--danger)_10%,var(--panel-2))] px-2.5 py-1.75 text-[var(--danger)]" data-testid="code-error-bar">
            <WarningIcon {...decorativeIconProps} />
            <span>{message()}</span>
          </div>
        )}
      </Show>
    </section>
  );
}

export function PreviewsPanel(props: {
  readonly root: SvgElementNode;
  readonly selectedNodes: readonly SvgNode[];
  readonly exportText: string;
  readonly previewSizes: readonly number[];
  readonly setPreviewSizes: (sizes: readonly number[]) => void;
}) {
  const selectedElements = createMemo(() => props.selectedNodes.filter((node): node is SvgElementNode => node.kind === "element"));

  return (
    <section class="panel previews-panel grid h-full min-h-0 grid-rows-[auto_minmax(180px,42%)_minmax(0,1fr)_auto] gap-2 overflow-auto rounded-md border border-[var(--soft-border)] bg-[var(--panel)] p-1.25" data-testid="previews-panel">
      <IconPreviews svgText={props.exportText} sizes={props.previewSizes} setSizes={props.setPreviewSizes} />
      <div class="preview-tile large grid min-h-29 !grid-rows-[minmax(0,1fr)] gap-1 rounded-md border border-[var(--soft-border)] bg-[var(--panel-2)] p-1.5 [&>svg]:h-full [&>svg]:min-h-0 [&>svg]:w-full" data-testid="full-preview-tile">
        <PreviewSvg root={props.root} testId="full-preview-svg" />
      </div>
      <div class="preview-grid grid min-h-0 grid-cols-[repeat(auto-fill,minmax(116px,1fr))] gap-2 overflow-auto" data-testid="selected-preview-grid">
        <For each={selectedElements()}>
          {(node) => (
            <div class="preview-tile grid min-h-29 grid-rows-[auto_minmax(0,1fr)] gap-1 rounded-md border border-[var(--soft-border)] bg-[var(--panel-2)] p-1.5 [&>svg]:h-full [&>svg]:min-h-0 [&>svg]:w-full" data-testid={`selected-preview-tile-${node.id}`}>
              <span data-testid={`selected-preview-label-${node.id}`}>{nodeLabel(node)}</span>
              <svg viewBox={svgSize(props.root).viewBox.join(" ")} preserveAspectRatio="xMidYMid meet" data-testid={`selected-preview-svg-${node.id}`}>
                <SvgRootPresentation root={props.root}>
                  <SvgNodeView node={node} selectedIds={[]} onNodePointerDown={() => undefined} openContextMenu={() => undefined} />
                </SvgRootPresentation>
              </svg>
            </div>
          )}
        </For>
      </div>
      <div class="preview-meta flex justify-between gap-2.5 text-[var(--muted)]" data-testid="preview-meta">
        <span data-testid="preview-file-size">{humanFileSize(new Blob([props.exportText]).size)}</span>
        <span data-testid="preview-dimensions">{svgSize(props.root).width}×{svgSize(props.root).height}</span>
      </div>
    </section>
  );
}

/** The document over a checkerboard, scaled to fit; `class` sizes the `<svg>` element. */
export function PreviewSvg(props: { readonly root: SvgElementNode; readonly testId?: string; readonly class?: string }) {
  return (
    <svg class={props.class} viewBox={svgSize(props.root).viewBox.join(" ")} preserveAspectRatio="xMidYMid meet" data-testid={props.testId ?? "preview-svg"}>
      <rect x={svgSize(props.root).viewBox[0]} y={svgSize(props.root).viewBox[1]} width={svgSize(props.root).viewBox[2]} height={svgSize(props.root).viewBox[3]} fill="url(#checker-preview)" />
      <defs>
        <pattern id="checker-preview" width="40" height="40" patternUnits="userSpaceOnUse">
          <rect width="40" height="40" fill="#737987" />
          <rect width="20" height="20" fill="#aeb4bf" opacity="0.45" />
          <rect x="20" y="20" width="20" height="20" fill="#aeb4bf" opacity="0.45" />
        </pattern>
      </defs>
      <SvgRootPresentation root={props.root}>
        <SvgNodeList nodes={props.root.children} selectedIds={[]} onNodePointerDown={() => undefined} openContextMenu={() => undefined} />
      </SvgRootPresentation>
    </svg>
  );
}

export function DebugPanel(props: {
  readonly root: SvgElementNode;
  readonly selectedNodes: readonly SvgNode[];
  readonly elementCount: number;
  readonly exportText: string;
  readonly heldKeys: readonly string[];
  readonly viewportPointer: PointerStateWithActive;
  readonly recentCommandEvent: EditorCommandEvent | undefined;
  /** GodSVG's advanced debug information (Ctrl+F3) adds memory limits and DOM details. */
  readonly advanced: boolean;
}) {
  const meter = createDebugMeter();

  return (
    <section class="panel debug-panel h-full min-h-0 overflow-auto rounded-md border border-[var(--soft-border)] bg-[var(--panel)] p-1.25" data-testid="debug-panel">
      <dl class="m-0 mb-2.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5" data-testid="debug-summary">
        <dt class="text-[var(--muted)]">Elements</dt>
        <dd data-testid="debug-element-count">{props.elementCount}</dd>
        <dt class="text-[var(--muted)]">Selected</dt>
        <dd data-testid="debug-selected-nodes">{props.selectedNodes.map(nodeLabel).join(", ") || "none"}</dd>
        <dt class="text-[var(--muted)]">Export bytes</dt>
        <dd data-testid="debug-export-bytes">{new Blob([props.exportText]).size}</dd>
        <dt class="text-[var(--muted)]">Root</dt>
        <dd data-testid="debug-root-name">{props.root.name}</dd>
        <dt class="text-[var(--muted)]">Held keys</dt>
        <dd data-testid="debug-held-keys">{props.heldKeys.join(" + ") || "none"}</dd>
        <dt class="text-[var(--muted)]">Pointer</dt>
        <dd data-testid="debug-pointer-state">{formatPointerState(props.viewportPointer)}</dd>
        <dt class="text-[var(--muted)]">Last command</dt>
        <dd data-testid="debug-last-command">{formatCommandEvent(props.recentCommandEvent)}</dd>
        <dt class="text-[var(--muted)]">FPS</dt>
        <dd data-testid="debug-fps">{meter.reading().fps}</dd>
        <dt class="text-[var(--muted)]">JS heap</dt>
        <dd data-testid="debug-heap">{formatBytes(meter.reading().heapUsed)}</dd>
        <dt class="text-[var(--muted)]">DOM nodes</dt>
        <dd data-testid="debug-dom-nodes">{meter.reading().domNodes}</dd>
        <Show when={props.advanced}>
          <dt class="text-[var(--muted)]">JS heap total</dt>
          <dd data-testid="debug-heap-total">{formatBytes(meter.reading().heapTotal)}</dd>
          <dt class="text-[var(--muted)]">JS heap limit</dt>
          <dd data-testid="debug-heap-limit">{formatBytes(meter.reading().heapLimit)}</dd>
          <dt class="text-[var(--muted)]">Pixel ratio</dt>
          <dd data-testid="debug-pixel-ratio">{globalThis.devicePixelRatio}</dd>
          <dt class="text-[var(--muted)]">Viewport size</dt>
          <dd data-testid="debug-window-size">{`${globalThis.innerWidth}×${globalThis.innerHeight}`}</dd>
        </Show>
      </dl>
      <pre class="m-0 mb-2.5 min-h-12 rounded-md border border-[var(--soft-border)] bg-[#080b12] p-2 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] in-[.theme-light]:bg-[#f8fbff]" data-testid="debug-input-log">
        {meter.inputs().join('\n')}
      </pre>
      <pre class="m-0 overflow-auto rounded-md border border-[var(--soft-border)] bg-[#080b12] p-2 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px]" data-testid="debug-selected-json">{JSON.stringify(props.selectedNodes, null, 2)}</pre>
    </section>
  );
}

function formatBytes(bytes: number | undefined): string {
  return bytes === undefined ? 'n/a' : humanFileSize(bytes);
}

function formatPointerState(pointer: PointerStateWithActive): string {
  if (!pointer.isActive) {
    return "inactive";
  }

  return `${pointer.pointerType ?? "pointer"} ${Math.round(pointer.x)}, ${Math.round(pointer.y)}`;
}

function formatCommandEvent(event: EditorCommandEvent | undefined): string {
  if (!event) {
    return "none";
  }

  if (event.type === "command.dispatched" || event.type === "command.transaction.updated") {
    return event.label;
  }

  if (event.type === "command.transaction.started") {
    return "transaction started";
  }

  if (event.type === "command.transaction.cancelled") {
    return "transaction cancelled";
  }

  if (event.type === "command.transaction.committed") {
    return event.changed ? "transaction committed" : "transaction unchanged";
  }

  return event.label ?? event.type;
}
