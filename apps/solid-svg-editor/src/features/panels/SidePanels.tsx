import { createMemo, For, Show } from "solid-js";

import { decorativeIconProps } from "../../editor/svg-icon";
import { humanFileSize } from "../../formatter";
import { nodeLabel, svgSize, type SvgElementNode, type SvgNode } from "../../svg-model";
import CopyIcon from "../ui/icons/Copy.svg";
import WarningIcon from "../ui/icons/Warning.svg";
import { PanelButton } from "../ui/PanelButton";
import { SvgNodeView } from "../viewport/ViewportParts";

export function CodePanel(props: {
  readonly code: string;
  readonly parseError: string | undefined;
  readonly applyCode: (text: string) => void;
  readonly reformatPretty: () => void;
  readonly reformatCompact: () => void;
  readonly copySvgText: () => void;
}) {
  return (
    <section class="panel code-panel grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-md border border-[var(--soft-border)] bg-[var(--panel)]" data-testid="code-panel">
      <div class="code-toolbar flex gap-1.5 border-b border-[var(--soft-border)] bg-[var(--panel-2)] p-1.5" data-testid="code-toolbar">
        <PanelButton type="button" icon={CopyIcon} data-testid="code-copy-button" onClick={props.copySvgText}>
          Copy
        </PanelButton>
        <PanelButton type="button" data-testid="code-format-pretty-button" onClick={props.reformatPretty}>
          Pretty
        </PanelButton>
        <PanelButton type="button" data-testid="code-format-compact-button" onClick={props.reformatCompact}>
          Compact
        </PanelButton>
      </div>
      <textarea
        class="code-textarea h-full w-full min-w-0 resize-none rounded-none border-0 bg-[#080b12] p-2.5 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] leading-[1.45] text-[var(--text)] [tab-size:2] in-[.theme-light]:bg-[#f8fbff]"
        name="svg-code"
        aria-label="SVG code"
        data-testid="svg-code-textarea"
        value={props.code}
        spellcheck={false}
        onInput={(event) => props.applyCode(event.currentTarget.value)}
      />
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
}) {
  const selectedElements = createMemo(() => props.selectedNodes.filter((node): node is SvgElementNode => node.kind === "element"));

  return (
    <section class="panel previews-panel grid h-full min-h-0 grid-rows-[minmax(180px,42%)_minmax(0,1fr)_auto] gap-2 overflow-auto rounded-md border border-[var(--soft-border)] bg-[var(--panel)] p-1.25" data-testid="previews-panel">
      <div class="preview-tile large grid min-h-29 !grid-rows-[minmax(0,1fr)] gap-1 rounded-md border border-[var(--soft-border)] bg-[var(--panel-2)] p-1.5 [&>svg]:h-full [&>svg]:min-h-0 [&>svg]:w-full" data-testid="full-preview-tile">
        <PreviewSvg root={props.root} testId="full-preview-svg" />
      </div>
      <div class="preview-grid grid min-h-0 grid-cols-[repeat(auto-fill,minmax(116px,1fr))] gap-2 overflow-auto" data-testid="selected-preview-grid">
        <For each={selectedElements()}>
          {(node) => (
            <div class="preview-tile grid min-h-29 grid-rows-[auto_minmax(0,1fr)] gap-1 rounded-md border border-[var(--soft-border)] bg-[var(--panel-2)] p-1.5 [&>svg]:h-full [&>svg]:min-h-0 [&>svg]:w-full" data-testid={`selected-preview-tile-${node.id}`}>
              <span data-testid={`selected-preview-label-${node.id}`}>{nodeLabel(node)}</span>
              <svg viewBox={svgSize(props.root).viewBox.join(" ")} preserveAspectRatio="xMidYMid meet" data-testid={`selected-preview-svg-${node.id}`}>
                <SvgNodeView node={node} selectedIds={[]} onNodePointerDown={() => undefined} openContextMenu={() => undefined} />
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

export function PreviewSvg(props: { readonly root: SvgElementNode; readonly testId?: string }) {
  return (
    <svg viewBox={svgSize(props.root).viewBox.join(" ")} preserveAspectRatio="xMidYMid meet" data-testid={props.testId ?? "preview-svg"}>
      <rect x={svgSize(props.root).viewBox[0]} y={svgSize(props.root).viewBox[1]} width={svgSize(props.root).viewBox[2]} height={svgSize(props.root).viewBox[3]} fill="url(#checker-preview)" />
      <defs>
        <pattern id="checker-preview" width="40" height="40" patternUnits="userSpaceOnUse">
          <rect width="40" height="40" fill="#737987" />
          <rect width="20" height="20" fill="#aeb4bf" opacity="0.45" />
          <rect x="20" y="20" width="20" height="20" fill="#aeb4bf" opacity="0.45" />
        </pattern>
      </defs>
      <For each={props.root.children}>{(node) => <SvgNodeView node={node} selectedIds={[]} onNodePointerDown={() => undefined} openContextMenu={() => undefined} />}</For>
    </svg>
  );
}

export function DebugPanel(props: {
  readonly root: SvgElementNode;
  readonly selectedNodes: readonly SvgNode[];
  readonly elementCount: number;
  readonly exportText: string;
}) {
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
      </dl>
      <pre class="m-0 overflow-auto rounded-md border border-[var(--soft-border)] bg-[#080b12] p-2 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px]" data-testid="debug-selected-json">{JSON.stringify(props.selectedNodes, null, 2)}</pre>
    </section>
  );
}
