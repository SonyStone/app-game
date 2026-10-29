import type { PsdExactRasterTreeEdit } from '@app-game/psd/editor';
import type { PsdLayerNode } from '@app-game/psd/viewer';
import { createEventListener } from '@solid-primitives/event-listener';
import { createMemo, createSignal, flush, onCleanup } from 'solid-js';
import type { LayerEditing } from '../editing/Editing';
import { groupUnavailable, selectionRoots, selectLayers } from './interactions';

/** Tree selection keeps persistent IDs across record renumbering; all changes use the existing editing session. */
export function createTreeEditing(
  props: {
    editing?: LayerEditing;
  },
  ordered: () => readonly PsdLayerNode[]
) {
  let active = true;
  onCleanup(() => {
    active = false;
  });
  const enabled = () => Boolean(props.editing?.enabled());
  const layers = () => props.editing?.layers() ?? [];
  const [ids, setIds] = createSignal<number[]>(() => {
    props.editing;
    return [];
  });
  const [anchor, setAnchor] = createSignal<number>();
  const [renaming, setRenaming] = createSignal<{ id: number; name: string }>();
  const [menu, setMenu] = createSignal<{ x: number; y: number }>();
  const byRecord = createMemo(() => {
    const source = props.editing?.state()?.source;
    return new Map(source?.ok ? source.value.layers.map((layer) => [layer.recordIndex, layer.layerId]) : []);
  });
  const idOf = (node: PsdLayerNode) => byRecord().get(node.index) ?? undefined;
  const selectedIds = () => ids().filter((id) => layers().some((layer) => layer.id === id));
  const selectedLayers = () => layers().filter((layer) => selectedIds().includes(layer.id));
  const busy = () => !enabled() || Boolean(props.editing?.busy());
  const roots = () => selectionRoots(layers(), selectedIds());
  const unavailable = (kind: 'rename' | 'opacity' | 'fill' | 'blend' | 'visible' | 'structure') => {
    const process = props.editing?.state()?.process;
    if (
      process?.ok &&
      (process.value.mode !== 3 || process.value.depth !== 8) &&
      !['rename', 'opacity'].includes(kind)
    ) {
      return 'This native color mode/depth only supports layer rename and opacity in this editor.';
    }
    return undefined;
  };
  const groupReason = () => unavailable('structure') ?? groupUnavailable(layers(), selectedIds());
  const ungroupReason = () => {
    const reason = unavailable('structure');
    if (reason) {
      return reason;
    }
    const selected = roots();
    if (selected.length !== 1 || !selected[0]?.group) {
      return 'Select one group to ungroup.';
    }
    const children = layers().filter((layer) => layer.parent === selected[0]!.id);
    if (!children.length) {
      return 'Empty groups cannot be ungrouped by this editor.';
    }
    if (children.length > 1 && children.some((layer) => layer.group)) {
      return 'Ungrouping multiple children with subgroups is not supported.';
    }
    return undefined;
  };

  function select(node: PsdLayerNode, event: Pick<MouseEvent, 'shiftKey' | 'metaKey' | 'ctrlKey'>) {
    const id = idOf(node);
    if (id === undefined) {
      return;
    }
    setIds(
      selectLayers(
        selectedIds(),
        ordered().flatMap((node) => {
          const value = idOf(node);
          return value === undefined ? [] : [value];
        }),
        id,
        anchor(),
        event
      )
    );
    if (!event.shiftKey && !event.metaKey && !event.ctrlKey) {
      setAnchor(id);
    }
    // Native clicks and shortcuts may arrive before the next animation frame.
    flush();
  }

  function apply(edits: PsdExactRasterTreeEdit[]) {
    if (busy() || !edits.length) {
      return Promise.resolve(false);
    }
    setMenu(undefined);
    return props.editing!.apply(edits);
  }

  async function group() {
    if (!groupReason()) {
      const names = new Set(layers().map((layer) => layer.name));
      let number = 1;
      while (names.has(`Group ${number}`)) {
        number++;
      }
      const name = `Group ${number}`;
      const accepted = await apply([
        { kind: 'groupSelectedLayers', layerIds: roots().map((layer) => layer.id), name, expanded: true }
      ]);
      if (!active || !accepted) {
        return;
      }
      const group = layers().find((layer) => layer.name === name && layer.group);
      if (group) {
        setIds([group.id]);
        setAnchor(group.id);
      }
    }
  }

  function ungroup() {
    if (!ungroupReason()) {
      void apply([{ kind: 'ungroupLayer', layerId: roots()[0]!.id }]);
    }
  }

  function remove() {
    if (unavailable('structure')) {
      return;
    }
    void apply(roots().map((layer) => ({ kind: 'delete', layerId: layer.id })));
  }

  createEventListener(
    () => (enabled() ? window : undefined),
    'keydown',
    (event) => {
      if (
        event.target instanceof Element &&
        event.target.closest('input, select, textarea, [contenteditable="true"]')
      ) {
        return;
      }
      if (event.key === 'Escape') {
        setMenu(undefined);
        setRenaming(undefined);
        return;
      }
      if (busy() || event.altKey || event.repeat) {
        return;
      }
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          props.editing?.redo();
        } else {
          props.editing?.undo();
        }
      } else if (command && event.key.toLowerCase() === 'g') {
        event.preventDefault();
        if (event.shiftKey) {
          ungroup();
        } else {
          group();
        }
      } else if (!command && (event.key === 'Delete' || event.key === 'Backspace') && selectedIds().length) {
        event.preventDefault();
        remove();
      }
    }
  );
  createEventListener(
    () => (menu() ? window : undefined),
    'pointerdown',
    (event) => {
      if (!(event.target instanceof Element) || !event.target.closest('[data-layer-menu]')) {
        setMenu(undefined);
      }
    }
  );

  return {
    enabled,
    layers,
    idOf,
    selectedIds,
    selectedLayers,
    busy,
    select,
    apply,
    roots,
    unavailable,
    groupReason,
    ungroupReason,
    group,
    ungroup,
    remove,
    renaming,
    setRenaming,
    menu,
    setMenu
  };
}
