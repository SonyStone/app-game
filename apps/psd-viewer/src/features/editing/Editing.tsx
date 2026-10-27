import type { PsdExactRasterTreeEdit } from '@app-game/psd/editor';
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from 'solid-js';
import type { OpenedPsd, PsdClient } from '../psd-worker';
import {
  historyLimit,
  preferredContract,
  viewerAgent,
  type EditingCommand,
  type EditingFailure,
  type EditingRequest,
  type EditingState
} from './contracts';
import styles from './editing.module.css';
import { browserDestination, streamSave } from './save';

/**
 * Independent guarded-edit feature. Mount keyed by the original source, so document replacement aborts saving
 * and discards late responses. Preview visibility/state controls elsewhere remain read-only overrides.
 */
export function Editing(props: {
  client: Pick<PsdClient, 'editor'>;
  document: OpenedPsd;
  name: string;
  /** Public monotonic editor revision, independent of replay's native revision. */
  onRevision: (revision: number) => void;
}) {
  const [enabled, setEnabled] = createSignal(false);
  const [state, setState] = createSignal<EditingState>();
  const [failure, setFailure] = createSignal<EditingFailure>();
  const [busy, setBusy] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [saveStatus, setSaveStatus] = createSignal('');
  const [target, setTarget] = createSignal<number>();
  const [name, setName] = createSignal('');
  const [opacity, setOpacity] = createSignal(255);
  const [fill, setFill] = createSignal(255);
  const [blend, setBlend] = createSignal('normal');
  const [groupName, setGroupName] = createSignal('Group 1');
  const [expanded, setExpanded] = createSignal(true);
  const [groupIds, setGroupIds] = createSignal<number[]>([]);
  const [ppi, setPpi] = createSignal(72);
  const [title, setTitle] = createSignal('');
  const [copyright, setCopyright] = createSignal<'publicDomain' | 'copyrightedWork' | 'unmarked'>('publicDomain');
  let active = true;
  let saveController: AbortController | undefined;
  let dragged: { id: number; parent: number | null; index: number } | undefined;
  onCleanup(() => {
    active = false;
    saveController?.abort();
  });

  const rpc = (request: EditingRequest) => props.client.editor(props.document.document, request);
  const layers = createMemo(() => {
    const tree = state()?.tree;
    if (tree?.ok) {
      return flatten(tree.value.layers);
    }
    const source = state()?.source;
    const ids = new Map(source?.ok ? source.value.layers.map((layer) => [layer.recordIndex, layer.layerId]) : []);
    return sourceLayers(props.document.layers, ids);
  });
  const selected = () => layers().find((layer) => layer.id === target());
  const contract = () => preferredContract;
  createEffect(
    () => selected(),
    (layer) => {
      if (layer) {
        setName(layer.name);
        setOpacity(layer.opacity);
        setFill(layer.fill);
        setBlend(layer.blend);
      }
    }
  );

  async function request(action: EditingRequest) {
    if (busy()) {
      return;
    }
    setBusy(true);
    setFailure(undefined);
    try {
      const result = await rpc(action);
      if (!active) {
        return;
      }
      if (!result.ok) {
        setFailure(result.error);
      } else if (result.value.kind === 'state') {
        const next = result.value.state;
        setState(next);
        props.onRevision(next.revision);
      }
    } catch (error) {
      if (active) {
        setFailure({ code: 'Unknown', message: String(error) });
      }
    } finally {
      if (active) {
        setBusy(false);
      }
    }
  }

  function edit(command: EditingCommand) {
    return request({ kind: 'edit', revision: state()?.revision ?? 0, command });
  }

  function tree(edit: PsdExactRasterTreeEdit) {
    return void request({ kind: 'edit', revision: state()?.revision ?? 0, command: { kind: 'tree', edit } });
  }

  async function save() {
    if (saving() || !state()) {
      return;
    }
    const revision = state()!.revision;
    const controller = new AbortController();
    saveController = controller;
    setSaving(true);
    setSaveStatus(`Preparing revision ${revision}…`);
    try {
      const bytes = await streamSave(
        rpc,
        revision,
        () => {
          if (active) {
            setSaveStatus(
              `Choose a destination for revision ${revision}. A file becomes complete only after all chunks are written.`
            );
          }
          return browserDestination(props.name);
        },
        controller.signal,
        (bytes) => {
          if (active && !controller.signal.aborted) {
            setSaveStatus(`Writing frozen revision ${revision}: ${bytes.toLocaleString()} bytes…`);
          }
        }
      );
      if (active) {
        setSaveStatus(
          `Saved revision ${revision}: ${bytes.toLocaleString()} bytes${state()?.revision !== revision ? '. Later edits are not included' : ''}.`
        );
      }
    } catch (error) {
      if (active) {
        const canceled = controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError');
        setSaveStatus(
          canceled ? 'Save canceled. Frozen buffers released.' : `Save failed. No complete file: ${String(error)}`
        );
      }
    } finally {
      if (active) {
        setSaving(false);
      }
    }
  }

  return (
    <section class={styles.editing} aria-label="Guarded editing" data-editor-revision={state()?.revision}>
      <button
        type="button"
        aria-pressed={enabled() ? 'true' : 'false'}
        onClick={() => {
          const next = !enabled();
          setEnabled(next);
          if (next && !state()) {
            void request({ kind: 'open' });
          }
        }}
      >
        Edit
      </button>
      <Show when={enabled()}>
        <p>Guarded editing. Original source bytes are retained. Viewing overrides do not edit the file.</p>
        <p role="note">
          Raster/tree operations currently refuse: the exact backend requires Photoshop attribution. The edit call
          remains authoritative for metadata.
        </p>
        <div class={styles.actions}>
          <button
            type="button"
            disabled={busy() || !state()?.position}
            onClick={() => void request({ kind: 'undo', revision: state()!.revision })}
          >
            Undo
          </button>
          <button
            type="button"
            disabled={busy() || !state() || state()!.position >= state()!.historyLength}
            onClick={() => void request({ kind: 'redo', revision: state()!.revision })}
          >
            Redo
          </button>
          <button type="button" disabled={busy() || saving() || !state()} onClick={() => void save()}>
            Save as…
          </button>
          <Show when={saving()}>
            <button type="button" onClick={() => saveController?.abort()}>
              Cancel save
            </button>
          </Show>
        </div>
        <p role="status" aria-label="Editor status">
          {busy() ? 'Working…' : `Revision ${state()?.revision ?? 0}. ${state()?.position ?? 0}/${historyLimit} edits.`}
        </p>
        <p role="status" aria-label="Save status">
          {saveStatus()}
        </p>
        <Show when={state()}>
          <details>
            <summary>Capabilities and host operands</summary>
            <p>
              Preferred contract: <code>{contract()}</code>. No retry with a weaker contract.
            </p>
            <p>
              Saving agent: {viewerAgent}. File stem: {props.name.replace(/\.(psd|psb)$/i, '')}. Exact tree saving is
              blocked at <code>save.softwareAgent</code>.
            </p>
            <p>
              v3 additionally needs a complete active PostScript font inventory, localized Background/proof labels and
              host preferences. The browser cannot establish these. They are refused, not guessed or copied from the
              imported file.
            </p>
            <p>
              File Info copyright is blocked because its writer hardcodes a Photoshop agent. Title has an unresolved
              backend companion writer. Resolution is attempted without resampling; the backend checks all companions.
            </p>
            <p>
              Inspection: tree {state()!.tree.ok ? 'available' : 'refused'}, source{' '}
              {state()!.source.ok ? 'available' : 'refused'}, native process{' '}
              {state()!.process.ok ? 'available' : 'refused'}. Inspection is not admission.
            </p>
            <p>
              Undo/commit replay: {state()!.cost.replayed} operations in {state()!.cost.milliseconds.toFixed(1)} ms;{' '}
              {state()!.cost.sourceBytes.toLocaleString()} source bytes. Limit {historyLimit} operations and 64 MiB
              eager source. Metadata retains resident pixel tiles.
            </p>
          </details>
          <fieldset disabled={busy()}>
            <legend>Layer requests · currently refused honestly</legend>
            <label>
              Layer{' '}
              <select
                aria-label="Edit layer"
                value={target() ?? ''}
                onChange={(event) => setTarget(Number(event.currentTarget.value))}
              >
                <option value="" disabled>
                  Select a layer
                </option>
                <For each={layers()}>
                  {(layer) => (
                    <option value={layer.id}>
                      {'· '.repeat(layer.depth)}
                      {layer.name} · #{layer.id}
                    </option>
                  )}
                </For>
              </select>
            </label>
            <Show when={selected()}>
              {(layer) => (
                <>
                  <label>
                    Name{' '}
                    <input
                      aria-label="Layer name"
                      value={name()}
                      onInput={(event) => setName(event.currentTarget.value)}
                    />
                  </label>
                  <button type="button" onClick={() => tree({ kind: 'rename', layerId: layer().id, name: name() })}>
                    Rename layer
                  </button>
                  <button
                    type="button"
                    onClick={() => tree({ kind: 'visible', layerId: layer().id, visible: !layer().visible })}
                  >
                    {layer().visible ? 'Hide layer' : 'Show layer'}
                  </button>
                  <label>
                    Opacity byte{' '}
                    <input
                      aria-label="Edit opacity"
                      type="number"
                      min="0"
                      max="255"
                      value={opacity()}
                      onInput={(event) => setOpacity(event.currentTarget.valueAsNumber)}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => tree({ kind: 'opacity', layerId: layer().id, opacity: opacity() })}
                  >
                    Apply opacity
                  </button>
                  <label>
                    Fill byte{' '}
                    <input
                      aria-label="Edit Fill"
                      type="number"
                      min="0"
                      max="255"
                      value={fill()}
                      onInput={(event) => setFill(event.currentTarget.valueAsNumber)}
                    />
                  </label>
                  <button type="button" onClick={() => tree({ kind: 'fill', layerId: layer().id, fill: fill() })}>
                    Apply Fill
                  </button>
                  <label>
                    Blend{' '}
                    <select
                      aria-label="Edit blend mode"
                      value={blend()}
                      onChange={(event) => setBlend(event.currentTarget.value)}
                    >
                      <For
                        each={[
                          'normal',
                          'multiply',
                          'screen',
                          'overlay',
                          'darken',
                          'lighten',
                          'difference',
                          'passThrough'
                        ]}
                      >
                        {(mode) => <option value={mode}>{mode}</option>}
                      </For>
                    </select>
                  </label>
                  <button type="button" onClick={() => tree({ kind: 'blend', layerId: layer().id, blend: blend() })}>
                    Apply blend mode
                  </button>
                  <button type="button" onClick={() => tree({ kind: 'delete', layerId: layer().id })}>
                    Delete layer
                  </button>
                  <button type="button" onClick={() => tree({ kind: 'ungroupLayer', layerId: layer().id })}>
                    Ungroup layer
                  </button>
                </>
              )}
            </Show>
            <details>
              <summary>Reorder by drag and group selection</summary>
              <p>Bottom to top. Drop onto a sibling to move before it. Ctrl/Cmd selection is not inferred.</p>
              <ul class={styles.stack}>
                <For each={layers()}>
                  {(layer) => (
                    <li
                      draggable="true"
                      data-edit-layer-id={layer.id}
                      onDragStart={(event) => {
                        dragged = layer;
                        event.dataTransfer?.setData('text/plain', String(layer.id));
                      }}
                      onDragEnd={() => {
                        dragged = undefined;
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (dragged) {
                          const index =
                            layer.index - (dragged.parent === layer.parent && dragged.index < layer.index ? 1 : 0);
                          tree({ kind: 'move', layerId: dragged.id, parent: layer.parent, index });
                          dragged = undefined;
                        }
                      }}
                    >
                      <label>
                        <input
                          type="checkbox"
                          aria-label={`Group selection: ${layer.name}`}
                          checked={groupIds().includes(layer.id)}
                          onChange={(event) => {
                            const checked = event.currentTarget.checked;
                            setGroupIds((ids) => (checked ? [...ids, layer.id] : ids.filter((id) => id !== layer.id)));
                          }}
                        />
                        {layer.name} · #{layer.id}
                      </label>
                    </li>
                  )}
                </For>
              </ul>
              <label>
                Group name{' '}
                <input
                  aria-label="Group name"
                  value={groupName()}
                  onInput={(event) => setGroupName(event.currentTarget.value)}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={expanded()}
                  onChange={(event) => setExpanded(event.currentTarget.checked)}
                />
                New group expanded
              </label>
              <button
                type="button"
                disabled={!groupIds().length}
                onClick={() =>
                  tree({
                    kind: 'groupSelectedLayers',
                    layerIds: layers()
                      .filter((layer) => groupIds().includes(layer.id))
                      .map((layer) => layer.id),
                    name: groupName(),
                    expanded: expanded()
                  })
                }
              >
                Group selected layers
              </button>
            </details>
          </fieldset>
          <fieldset disabled={busy()}>
            <legend>File Info and resolution</legend>
            <label>
              Resolution without resampling{' '}
              <input
                aria-label="Resolution ppi"
                type="number"
                min="0.0000152587890625"
                step="any"
                value={ppi()}
                onInput={(event) => setPpi(event.currentTarget.valueAsNumber)}
              />
            </label>
            <button
              type="button"
              onClick={() => void edit({ kind: 'metadata', edit: { kind: 'resolutionNoResample', ppi: ppi() } })}
            >
              Apply resolution
            </button>
            <label>
              Title{' '}
              <input
                aria-label="File Info title"
                value={title()}
                onInput={(event) => setTitle(event.currentTarget.value)}
              />
            </label>
            <button
              type="button"
              onClick={() => void edit({ kind: 'metadata', edit: { kind: 'fileInfoTitle', title: title() } })}
            >
              Apply title
            </button>
            <label>
              Copyright{' '}
              <select
                aria-label="File Info copyright"
                value={copyright()}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  if (value === 'publicDomain' || value === 'copyrightedWork' || value === 'unmarked') {
                    setCopyright(value);
                  }
                }}
              >
                <option value="publicDomain">Public domain</option>
                <option value="copyrightedWork">Copyrighted work</option>
                <option value="unmarked">Unmarked</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => void edit({ kind: 'metadata', edit: { kind: 'fileInfoCopyright', status: copyright() } })}
            >
              Apply copyright
            </button>
          </fieldset>
        </Show>
        <Show when={failure()}>
          {(error) => (
            <div role="alert" data-refusal-code={error().code} class={styles.refusal}>
              <strong>{error().code}</strong>
              <Show when={failurePath(error())}>{(path) => <code>{path()}</code>}</Show>
              <details open={false}>
                <summary>Refusal details</summary>
                <p>{error().message}</p>
                <p>Document and revision unchanged. No fallback.</p>
              </details>
            </div>
          )}
        </Show>
      </Show>
    </section>
  );
}

function flatten(
  nodes: Extract<EditingState['tree'], { ok: true }>['value']['layers'],
  parent: number | null = null,
  depth = 0
): Array<
  Extract<EditingState['tree'], { ok: true }>['value']['layers'][number] & {
    parent: number | null;
    depth: number;
    index: number;
  }
> {
  return nodes.flatMap((node, index) => [
    { ...node, parent, depth, index },
    ...flatten(node.children, node.id, depth + 1)
  ]);
}

function failurePath(error: EditingFailure) {
  return 'propertyPath' in error ? error.propertyPath : undefined;
}

/** Persistent IDs come only from source inspection, never from a panel/record index. */
function sourceLayers(
  nodes: OpenedPsd['layers'],
  ids: Map<number, number | null>,
  parent: number | null = null,
  depth = 0
): ReturnType<typeof flatten> {
  return [...nodes].reverse().flatMap((node, index) => {
    const id = ids.get(node.index);
    if (id === undefined || id === null) {
      return [];
    }
    return [
      {
        id,
        endId: null,
        name: node.name,
        visible: node.visible,
        opacity: node.opacity,
        fill: node.fill,
        blend: node.blendMode,
        clipped: node.clipped,
        link: null,
        linkEnabled: null,
        children: [],
        parent,
        depth,
        index
      },
      ...sourceLayers(node.children ?? [], ids, id, depth + 1)
    ];
  });
}
