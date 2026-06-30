import { createMemo, For, Show } from "solid-js";

import { humanFileSize } from "../../formatter";
import { nodeLabel, svgSize, type SvgElementNode, type SvgNode } from "../../svg-model";
import { SvgNodeView } from "../viewport/ViewportParts";

export function CodePanel(props: {
  readonly code: () => string;
  readonly parseError: () => string | undefined;
  readonly applyCode: (text: string) => void;
  readonly reformatPretty: () => void;
  readonly reformatCompact: () => void;
  readonly copySvgText: () => void;
}) {
  return (
    <section class="panel code-panel">
      <div class="code-toolbar">
        <button type="button" onClick={props.copySvgText}>
          <img src="/assets/icons/Copy.svg" alt="" /> Copy
        </button>
        <button type="button" onClick={props.reformatPretty}>
          Pretty
        </button>
        <button type="button" onClick={props.reformatCompact}>
          Compact
        </button>
      </div>
      <textarea class="code-textarea" name="svg-code" aria-label="SVG code" value={props.code()} spellcheck={false} onInput={(event) => props.applyCode(event.currentTarget.value)} />
      <Show when={props.parseError()}>
        {(message) => (
          <div class="error-bar">
            <img src="/assets/icons/Warning.svg" alt="" />
            <span>{message()}</span>
          </div>
        )}
      </Show>
    </section>
  );
}

export function PreviewsPanel(props: {
  readonly root: () => SvgElementNode;
  readonly selectedNodes: () => readonly SvgNode[];
  readonly exportText: () => string;
}) {
  const selectedElements = createMemo(() => props.selectedNodes().filter((node): node is SvgElementNode => node.kind === "element"));

  return (
    <section class="panel previews-panel">
      <div class="preview-tile large">
        <PreviewSvg root={props.root()} />
      </div>
      <div class="preview-grid">
        <For each={selectedElements()}>
          {(node) => (
            <div class="preview-tile">
              <span>{nodeLabel(node)}</span>
              <svg viewBox={svgSize(props.root()).viewBox.join(" ")} preserveAspectRatio="xMidYMid meet">
                <SvgNodeView node={node} selectedIds={() => []} selectNode={() => undefined} openContextMenu={() => undefined} />
              </svg>
            </div>
          )}
        </For>
      </div>
      <div class="preview-meta">
        <span>{humanFileSize(new Blob([props.exportText()]).size)}</span>
        <span>{svgSize(props.root()).width}×{svgSize(props.root()).height}</span>
      </div>
    </section>
  );
}

export function PreviewSvg(props: { readonly root: SvgElementNode }) {
  return (
    <svg viewBox={svgSize(props.root).viewBox.join(" ")} preserveAspectRatio="xMidYMid meet">
      <rect x={svgSize(props.root).viewBox[0]} y={svgSize(props.root).viewBox[1]} width={svgSize(props.root).viewBox[2]} height={svgSize(props.root).viewBox[3]} fill="url(#checker-preview)" />
      <defs>
        <pattern id="checker-preview" width="40" height="40" patternUnits="userSpaceOnUse">
          <rect width="40" height="40" fill="#737987" />
          <rect width="20" height="20" fill="#aeb4bf" opacity="0.45" />
          <rect x="20" y="20" width="20" height="20" fill="#aeb4bf" opacity="0.45" />
        </pattern>
      </defs>
      <For each={props.root.children}>{(node) => <SvgNodeView node={node} selectedIds={() => []} selectNode={() => undefined} openContextMenu={() => undefined} />}</For>
    </svg>
  );
}

export function DebugPanel(props: {
  readonly root: () => SvgElementNode;
  readonly selectedNodes: () => readonly SvgNode[];
  readonly elementCount: () => number;
  readonly exportText: () => string;
}) {
  return (
    <section class="panel debug-panel">
      <dl>
        <dt>Elements</dt>
        <dd>{props.elementCount()}</dd>
        <dt>Selected</dt>
        <dd>{props.selectedNodes().map(nodeLabel).join(", ") || "none"}</dd>
        <dt>Export bytes</dt>
        <dd>{new Blob([props.exportText()]).size}</dd>
        <dt>Root</dt>
        <dd>{props.root().name}</dd>
      </dl>
      <pre>{JSON.stringify(props.selectedNodes(), null, 2)}</pre>
    </section>
  );
}

