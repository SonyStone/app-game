import { attachBrushResources } from '../features/brush-detail/brush-resources';
import { createMemo, createSignal } from 'solid-js';
import type { ReorderEvent } from 'solid-nest';
import type { AbrFile, AbrFileWithMeta, BrushWithPreview } from './abr';
import {
  allBrushNodes,
  buildTreeFromFile,
  cloneNode,
  collectBrushes,
  createRootNode,
  findNode,
  groupToAbrFile,
  insertBlocksAtPlace,
  removeBlocksById,
  type GroupNode,
  type TreeNode
} from './brush-tree';

/** Owns the editable collection and bounded undo history. Binary brush data is shared, never mutated. */
export function createWorkspace() {
  const importedSources: AbrFileWithMeta[] = [];
  const [root, setRoot] = createSignal(createRootNode());
  const [selection, setSelection] = createSignal<string[]>([]);
  const [activeId, setActiveId] = createSignal<string>();
  const [past, setPast] = createSignal<GroupNode[]>([]);
  const [future, setFuture] = createSignal<GroupNode[]>([]);
  const [savedRoot, setSavedRoot] = createSignal(root());
  const active = createMemo(() => allBrushNodes(root().children).find((node) => node.id === activeId()));

  /** Commits a tree operation without copying potentially large sample buffers. */
  function change(edit: (draft: GroupNode) => void) {
    const previous = root();
    const draft = copyTree(previous);
    edit(draft);
    setPast((history) => [...history.slice(-49), previous]);
    setFuture([]);
    setRoot(draft);
  }

  return {
    root,
    selection,
    setSelection,
    activeId,
    setActiveId,
    active,
    dirty: () => root() !== savedRoot(),
    canUndo: () => past().length > 0,
    canRedo: () => future().length > 0,
    markExported: () => setSavedRoot(root()),
    undo() {
      const previous = past().at(-1);
      if (!previous) return;
      setFuture((items) => [...items, root()]);
      setPast((items) => items.slice(0, -1));
      setRoot(previous);
    },
    redo() {
      const next = future().at(-1);
      if (!next) return;
      setPast((items) => [...items, root()]);
      setFuture((items) => items.slice(0, -1));
      setRoot(next);
    },
    importFiles(files: AbrFileWithMeta[]) {
      files.forEach(attachBrushResources);
      importedSources.push(...files);
      const groups = files.map((file) => {
        const group = buildTreeFromFile(file);
        const onlyChild = group.children.length === 1 ? group.children[0] : undefined;
        // Some ABRs already wrap every preset in a folder with the file's name.
        if (onlyChild?.kind === 'group' && onlyChild.name === group.name) {
          group.children = onlyChild.children;
          group.uuid = onlyChild.uuid;
        }
        group.expanded = true;
        return group;
      });
      change((draft) => draft.children.push(...groups));
      const first = allBrushNodes(groups)[0];
      if (first) {
        setActiveId(first.id);
        setSelection([first.id]);
      }
    },
    updateBrush(id: string, brush: BrushWithPreview) {
      change((draft) => {
        const node = findNode(draft.children, id)?.node;
        if (node?.kind === 'brush') {
          node.brush = brush;
          node.name = brush.name;
        }
      });
    },
    toggleGroup(id: string) {
      const draft = copyTree(root());
      const node = findNode(draft.children, id)?.node;
      if (node?.kind === 'group') node.expanded = !node.expanded;
      // Expansion is navigation, not an undoable document edit.
      if (savedRoot() === root()) setSavedRoot(draft);
      setRoot(draft);
    },
    rename(id: string, name: string) {
      if (!name.trim()) return;
      change((draft) => {
        const node = findNode(draft.children, id)?.node;
        if (node) node.name = name.trim();
      });
    },
    addGroup(parentId = root().id) {
      const group: GroupNode = {
        id: crypto.randomUUID(),
        kind: 'group',
        name: 'New Group',
        expanded: true,
        children: []
      };
      change((draft) => {
        const parent = parentId === draft.id ? draft : findNode(draft.children, parentId)?.node;
        if (parent?.kind === 'group') {
          parent.expanded = true;
          parent.children.push(group);
        }
      });
      setSelection([group.id]);
    },
    remove(ids = selection()) {
      if (!ids.length) return;
      change((draft) => removeBlocksById(draft, ids));
      setSelection([]);
    },
    duplicate() {
      const ids = new Set(selection());
      change((draft) => {
        const visit = (group: GroupNode) => {
          group.children = group.children.flatMap((node) => {
            if (ids.has(node.id)) {
              const copy = cloneNode(node);
              copy.name += ' copy';
              if (copy.kind === 'brush') copy.brush = { ...copy.brush, name: copy.name };
              return [node, copy];
            }
            if (node.kind === 'group') visit(node);
            return [node];
          });
        };
        visit(draft);
      });
    },
    reorder(event: ReorderEvent<string>) {
      const moving = event.keys.map((id) => findNode(root().children, id)?.node).filter((node) => node !== undefined);
      if (
        moving.some(
          (node) =>
            node.id === event.place.parent || (node.kind === 'group' && findNode(node.children, event.place.parent))
        )
      )
        return;
      change((draft) => {
        const nodes: TreeNode[] = [];
        removeBlocksById(draft, event.keys, nodes);
        insertBlocksAtPlace(draft, nodes, event.place);
      });
    },
    exportFile(scope: 'all' | 'selection' | GroupNode): AbrFile {
      const group =
        typeof scope === 'object' ? scope : scope === 'all' ? root() : selectedTree(root(), new Set(selection()));
      return workspaceToAbrFile(group, root(), importedSources);
    }
  };
}

/** Controller shared by the collection and settings panels. */
export type Workspace = ReturnType<typeof createWorkspace>;

/** Preserves displayed folders and sample resources when exporting any workspace subset. */
export function workspaceToAbrFile(
  group: GroupNode,
  sourceRoot: GroupNode,
  importedSources: AbrFileWithMeta[] = []
): AbrFile {
  const file = groupToAbrFile(group);
  const sources = new Set<AbrFileWithMeta>(importedSources);
  const visit = (node: TreeNode) => {
    if (node.kind !== 'group') return;
    if (node.sourceFile) sources.add(node.sourceFile);
    node.children.forEach(visit);
  };
  visit(sourceRoot);
  // Retain patterns; the writer preserves selected sample records and their dual-tip dependencies.
  const patterns = [...sources].flatMap((source) => (source.rawPatternData ? [source.rawPatternData] : []));
  const rawPatternData = new Uint8Array(patterns.reduce((size, data) => size + data.length, 0));
  let offset = 0;
  for (const data of patterns) {
    rawPatternData.set(data, offset);
    offset += data.length;
  }
  const sourceFiles = [...sources];
  const subVersions = new Set(
    sourceFiles.filter((source) => source.rawSampleData?.length).map((source) => source.subVersion)
  );
  if (subVersions.size > 1)
    throw new Error('Cannot combine different ABR sample layouts without converting their metadata');
  return {
    ...file,
    version: Math.max(6, ...sourceFiles.map((source) => source.version)),
    subVersion: subVersions.values().next().value ?? 2,
    rawSampleData: undefined,
    rawPatternData,
    descriptorRoot: sourceFiles.length === 1 ? sourceFiles[0]!.descriptorRoot : undefined,
    resourceBlocks: sourceFiles
      .flatMap((source) => source.resourceBlocks ?? [])
      .filter((block) => !['samp', 'patt', 'desc', 'phry'].includes(block.key)),
    errors: sourceFiles.flatMap((source) => source.errors.map((error) => `${source.fileName}: ${error}`))
  };
}

/** Copies only tree containers; brush records and binary resources remain immutable shared values. */
function copyTree(group: GroupNode): GroupNode {
  return { ...group, children: group.children.map((node) => (node.kind === 'group' ? copyTree(node) : { ...node })) };
}

/** Includes selected folders in full and retains ancestors of individually selected brushes. */
function selectedTree(root: GroupNode, ids: Set<string>): GroupNode {
  return {
    ...root,
    children: root.children.flatMap((node) => {
      if (ids.has(node.id)) return [node];
      if (node.kind === 'brush') return [];
      const selected = selectedTree(node, ids);
      return collectBrushes(selected).length ? [selected] : [];
    })
  };
}
