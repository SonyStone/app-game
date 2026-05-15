import { Tree } from '@app-game/math-examples/tree-struct/tree';
import { trackStore } from '@solid-primitives/deep';
import { createUndoHistory } from '@solid-primitives/history';
import { createEffect, createMemo, createResource, Show } from 'solid-js';
import { createStore, produce, reconcile, SetStoreFunction, unwrap } from 'solid-js/store';
import type { BookmarksTreeView } from './BookmarksTreeView.type';
import { createDragAndDrop } from './createDragHandler';
import { DragFeedback } from './DragFeedback';
import { insertChildrenAtPath } from './insertChildrenAtPath';
import { NodeItem2 } from './NodeItem';
import treeExported2Url from './tree-exported-2.json?url';
import treeExported4Url from './tree-exported-4.json?url';
import { bookmarksTreeSchema, isNodeInsert, isNodeNewRoot } from './tree-schema';
import { moveNode } from './TreeViewUtils';

function createTreeView(props: { treeUrl: string }) {
  const [data] = createResource(props.treeUrl, (treeUrl) => fetch(treeUrl).then((res) => res.json()));

  const flatTree = createMemo(() => {
    if (data()) {
      const { success, data: result, error } = bookmarksTreeSchema.safeParse(data());
      if (success) {
        return result;
      }
      console.error('Failed to parse bookmarks tree:', error);
    }

    return undefined;
  });

  const tree = createMemo(() => {
    const _flatTree = flatTree();
    const tree = {} as BookmarksTreeView;

    if (!_flatTree) {
      return tree;
    }

    for (let index = 0; index < _flatTree.length; index++) {
      const element = _flatTree[index];
      if (index === 0 && isNodeNewRoot(element)) {
        tree.type = element.node.type;
        tree.data = element.node.data;
        tree.children = [];
        tree.id = index;
      } else if (isNodeInsert(element)) {
        const [, nodeData, path] = element;
        const normalizedNode = {
          ...nodeData,
          type: 'type' in nodeData ? nodeData.type : 'default',
          id: index
        } as BookmarksTreeView;

        insertChildrenAtPath(tree, path, normalizedNode);
      }
    }

    return tree;
  });

  const [state, setState] = createStore<BookmarksTreeView>({} as BookmarksTreeView);

  createEffect(() => {
    setState(tree());
  });

  const history = createUndoHistory(
    () => {
      trackStore(state);
      // if state is empty, do not track
      if (Object.keys(state).length === 0) {
        return;
      }
      const copy = structuredClone(unwrap(state));
      return () => {
        setState(reconcile(structuredClone(copy)));
      };
    },
    {
      limit: 25
    }
  );

  return { state, setState, history };
}

export default function BookmarksExplorer() {
  const tree1 = createTreeView({ treeUrl: treeExported2Url });
  const tree2 = createTreeView({ treeUrl: treeExported4Url });

  return (
    <div>
      <h1>Bookmarks Explorer</h1>
      <button class="rounded-2xl border px-2" onClick={tree1.history.undo}>
        Undo
      </button>
      <button class="rounded-2xl border px-2" onClick={tree1.history.redo}>
        Redo
      </button>
      <div class="flex">
        <TreeView state={tree1.state} setState={tree1.setState} />
        <TreeView state={tree2.state} setState={tree2.setState} />
      </div>
    </div>
  );
}

function TreeView(
  props: Partial<{
    state: BookmarksTreeView;
    setState: SetStoreFunction<BookmarksTreeView>;
  }>
) {
  const { dropHandlers, rect, hasSubnodes, dragging, dragHandlers, droppable } = createDragAndDrop({
    onMoveNode: (from, to) => {
      console.log('Move node from', from, 'to', to);
      props.setState?.(
        produce((tree) => {
          moveNode(tree, from, to);
        })
      );
    }
  });

  return (
    <div class="h-80vh relative flex-1 overflow-auto border">
      <ul {...dropHandlers}>
        <Tree root={props.state}>
          {(props) => {
            return (
              <div class="contents">
                <NodeItem2
                  node={props.node as BookmarksTreeView}
                  path={props.path}
                  dragHandlers={dragHandlers}
                  droppable={droppable}
                >
                  {props.children}
                </NodeItem2>
              </div>
            );
          }}
        </Tree>
      </ul>
      <Show when={dragging()}>
        <DragFeedback rect={rect()} hasSubnodes={hasSubnodes()} />
      </Show>
    </div>
  );
}
