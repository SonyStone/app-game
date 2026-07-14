import { createMemo, For, Show } from "solid-js";
import type { PointerStateWithActive } from '@solid-primitives/pointer';

import type { EditorCommandEvent } from "../../editor/commands";
import {
  formatExtensionPackageActivation,
  formatExtensionPackageDependencies,
  formatInstalledPackageCompatibility,
  formatInstalledPackageContributions,
  formatInstalledPackageDependents,
  formatInstalledPackageLoadOrder,
  formatInstalledPackageMigrations,
  formatInstalledPackageUpdates
} from "../../editor/extension-packages";
import type {
  EditorContributionSource,
  EditorInstalledPackageCompatibility,
  EditorInstalledPackageDependencyGraphEntry,
  EditorInstalledPackageState,
  EditorInstalledPackageUpdate,
  EditorRegistryHealth,
  EditorRegistryIssue,
  SvgNodeRendererAdapter
} from "../../editor/kernel";
import { createEditorRegistryDiagnostics } from "../../editor/registry-diagnostics";
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
  readonly svgNodeRenderer?: SvgNodeRendererAdapter;
}) {
  const selectedElements = createMemo(() => props.selectedNodes.filter((node): node is SvgElementNode => node.kind === "element"));

  return (
    <section class="panel previews-panel grid h-full min-h-0 grid-rows-[minmax(180px,42%)_minmax(0,1fr)_auto] gap-2 overflow-auto rounded-md border border-[var(--soft-border)] bg-[var(--panel)] p-1.25" data-testid="previews-panel">
      <div class="preview-tile large grid min-h-29 !grid-rows-[minmax(0,1fr)] gap-1 rounded-md border border-[var(--soft-border)] bg-[var(--panel-2)] p-1.5 [&>svg]:h-full [&>svg]:min-h-0 [&>svg]:w-full" data-testid="full-preview-tile">
        <PreviewSvg
          root={props.root}
          testId="full-preview-svg"
          {...(props.svgNodeRenderer ? { svgNodeRenderer: props.svgNodeRenderer } : {})}
        />
      </div>
      <div class="preview-grid grid min-h-0 grid-cols-[repeat(auto-fill,minmax(116px,1fr))] gap-2 overflow-auto" data-testid="selected-preview-grid">
        <For each={selectedElements()}>
          {(node) => (
            <div class="preview-tile grid min-h-29 grid-rows-[auto_minmax(0,1fr)] gap-1 rounded-md border border-[var(--soft-border)] bg-[var(--panel-2)] p-1.5 [&>svg]:h-full [&>svg]:min-h-0 [&>svg]:w-full" data-testid={`selected-preview-tile-${node.id}`}>
              <span data-testid={`selected-preview-label-${node.id}`}>{nodeLabel(node)}</span>
              <svg viewBox={svgSize(props.root).viewBox.join(" ")} preserveAspectRatio="xMidYMid meet" data-testid={`selected-preview-svg-${node.id}`}>
                <SvgNodeView
                  node={node}
                  selectedIds={[]}
                  selectedTargets={[]}
                  onNodePointerDown={() => undefined}
                  onSelectionTargetPointerDown={() => undefined}
                  openContextMenu={() => undefined}
                  openSelectionTargetContextMenu={() => undefined}
                  {...(props.svgNodeRenderer ? { renderer: props.svgNodeRenderer } : {})}
                />
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

export function PreviewSvg(props: {
  readonly root: SvgElementNode;
  readonly testId?: string;
  readonly svgNodeRenderer?: SvgNodeRendererAdapter;
}) {
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
      <For each={props.root.children}>
        {(node) => (
          <SvgNodeView
            node={node}
            selectedIds={[]}
            selectedTargets={[]}
            onNodePointerDown={() => undefined}
            onSelectionTargetPointerDown={() => undefined}
            openContextMenu={() => undefined}
            openSelectionTargetContextMenu={() => undefined}
            {...(props.svgNodeRenderer ? { renderer: props.svgNodeRenderer } : {})}
          />
        )}
      </For>
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
  readonly packageStates: readonly EditorInstalledPackageState[];
  readonly packageLoadOrder: readonly string[];
  readonly packageDependencyGraph: readonly EditorInstalledPackageDependencyGraphEntry[];
  readonly packageCompatibility: readonly EditorInstalledPackageCompatibility[];
  readonly packageUpdates: readonly EditorInstalledPackageUpdate[];
  readonly contributionSources: readonly EditorContributionSource[];
  readonly contributionCount: number;
  readonly registryHealth: EditorRegistryHealth;
  readonly registryIssues: readonly EditorRegistryIssue[];
}) {
  const registryDiagnostics = createMemo(() =>
    createEditorRegistryDiagnostics(props.registryIssues, {
      contributionSources: props.contributionSources
    })
  );

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
        <dt class="text-[var(--muted)]">Packages</dt>
        <dd data-testid="debug-package-count">{props.packageStates.length}</dd>
        <dt class="text-[var(--muted)]">Contributions</dt>
        <dd data-testid="debug-contribution-count">{props.contributionCount}</dd>
        <dt class="text-[var(--muted)]">Sources</dt>
        <dd data-testid="debug-contribution-source-count">{props.contributionSources.length}</dd>
        <dt class="text-[var(--muted)]">Health</dt>
        <dd data-testid="debug-registry-health-status">{props.registryHealth.status}</dd>
        <dt class="text-[var(--muted)]">Package health</dt>
        <dd data-testid="debug-registry-health-packages">
          {props.registryHealth.activePackageCount} active / {props.registryHealth.disabledPackageCount} disabled / {props.registryHealth.blockedPackageCount} blocked
        </dd>
        <dt class="text-[var(--muted)]">Issue health</dt>
        <dd data-testid="debug-registry-health-issues">
          {props.registryHealth.errorCount} errors / {props.registryHealth.warningCount} warnings
        </dd>
        <dt class="text-[var(--muted)]">Registry issues</dt>
        <dd data-testid="debug-registry-issue-count">{props.registryIssues.length}</dd>
      </dl>
      <Show when={props.registryIssues.length > 0}>
        <ul
          class="m-0 mb-2.5 grid list-none gap-1 rounded-md border border-[color-mix(in_srgb,var(--warning)_36%,var(--soft-border))] bg-[color-mix(in_srgb,var(--warning)_10%,var(--panel-2))] p-2 text-[var(--warning)]"
          data-testid="debug-registry-issues"
        >
          <For each={registryDiagnostics()}>
            {(diagnostic) => (
              <li class="grid gap-0.5" data-testid={`debug-registry-issue-${diagnostic.issue.kind}-${diagnostic.issue.id}`}>
                <div class="flex flex-wrap items-center gap-1.5">
                  <span class="rounded-[4px] border border-current px-1 text-[10px] uppercase" data-testid={`debug-registry-issue-severity-${diagnostic.id}`}>
                    {diagnostic.severity}
                  </span>
                  <span data-testid={`debug-registry-issue-message-${diagnostic.id}`}>{diagnostic.message}</span>
                </div>
                <span class="text-[var(--muted)]" data-testid={`debug-registry-issue-detail-${diagnostic.id}`}>
                  {diagnostic.detail}
                </span>
                <span data-testid={`debug-registry-issue-fix-${diagnostic.id}`}>{diagnostic.fix}</span>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <Show when={props.contributionSources.length > 0}>
        <ul
          class="m-0 mb-2.5 grid list-none gap-1 rounded-md border border-[var(--soft-border)] bg-[var(--panel-2)] p-2"
          data-testid="debug-contribution-sources"
        >
          <For each={props.contributionSources}>
            {(source, index) => (
              <li class="grid gap-0.5" data-testid={`debug-contribution-source-${index()}`}>
                {formatContributionSource(source)}
              </li>
            )}
          </For>
        </ul>
      </Show>
      <Show when={props.packageStates.length > 0}>
        <ul
          class="m-0 mb-2.5 grid list-none gap-1 rounded-md border border-[var(--soft-border)] bg-[var(--panel-2)] p-2"
          data-testid="debug-installed-packages"
        >
          <For each={props.packageStates}>
            {(packageState) => (
              <li class="grid gap-0.5" data-testid={`debug-installed-package-${packageState.installedPackage.manifest.id}`}>
                <span data-testid={`debug-installed-package-label-${packageState.installedPackage.manifest.id}`}>
                  {packageState.installedPackage.manifest.name} {packageState.installedPackage.manifest.version}
                </span>
                <span class="text-[var(--muted)]" data-testid={`debug-installed-package-status-${packageState.installedPackage.manifest.id}`}>
                  status {formatExtensionPackageActivation(packageState.activation)}
                </span>
                <span class="text-[var(--muted)]" data-testid={`debug-installed-package-detail-${packageState.installedPackage.manifest.id}`}>
                  {packageState.installedPackage.manifest.id} - api {packageState.installedPackage.manifest.editorApiVersion} - contributes{" "}
                  {formatInstalledPackageContributions(packageState.installedPackage)}
                </span>
                <span class="text-[var(--muted)]" data-testid={`debug-installed-package-compatibility-${packageState.installedPackage.manifest.id}`}>
                  compatibility {formatInstalledPackageCompatibility(packageState.installedPackage, props.packageCompatibility)}
                </span>
                <span class="text-[var(--muted)]" data-testid={`debug-installed-package-migrations-${packageState.installedPackage.manifest.id}`}>
                  migrations {formatInstalledPackageMigrations(packageState.installedPackage.manifest)}
                </span>
                <span class="text-[var(--muted)]" data-testid={`debug-installed-package-updates-${packageState.installedPackage.manifest.id}`}>
                  updates {formatInstalledPackageUpdates(packageState.installedPackage, props.packageUpdates)}
                </span>
                <span class="text-[var(--muted)]" data-testid={`debug-installed-package-dependencies-${packageState.installedPackage.manifest.id}`}>
                  depends on {formatExtensionPackageDependencies(packageState.installedPackage.manifest)}
                </span>
                <span class="text-[var(--muted)]" data-testid={`debug-installed-package-load-order-${packageState.installedPackage.manifest.id}`}>
                  load order {formatInstalledPackageLoadOrder(packageState.installedPackage, props.packageLoadOrder)}
                </span>
                <span class="text-[var(--muted)]" data-testid={`debug-installed-package-dependents-${packageState.installedPackage.manifest.id}`}>
                  required by {formatInstalledPackageDependents(packageState.installedPackage, props.packageDependencyGraph)}
                </span>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <pre class="m-0 overflow-auto rounded-md border border-[var(--soft-border)] bg-[#080b12] p-2 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px]" data-testid="debug-selected-json">{JSON.stringify(props.selectedNodes, null, 2)}</pre>
    </section>
  );
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

  if (event.type === "command.transaction.committed") {
    return event.changed ? "transaction committed" : "transaction unchanged";
  }

  if (event.type === "command.transaction.canceled") {
    return event.changed ? "transaction canceled" : "transaction cancel ignored";
  }

  return event.label ?? event.type;
}

function formatContributionSource(source: EditorContributionSource): string {
  switch (source.kind) {
    case "core":
      return `${source.contributionId} from core`;
    case "direct":
      return `${source.contributionId} from direct install`;
    case "raw":
      return `${source.contributionId} from raw external install`;
    case "package":
      return `${source.contributionId} from package ${source.packageId}`;
    default: {
      const exhaustive: never = source;
      return exhaustive;
    }
  }
}
