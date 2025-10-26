import { trackStore } from '@solid-primitives/deep';
import { createUndoHistory } from '@solid-primitives/history';
import { createEffect, createMemo, createResource, Show } from 'solid-js';
import { createStore, produce, reconcile, unwrap } from 'solid-js/store';
import type { BookmarksTreeView } from './BookmarksTreeView.type';
import { DragAndDropConsumer, DragAndDropProvider } from './createDragHandler';
import { DragFeedback } from './DragFeedback';
import { insertChildrenAtPath } from './insertChildrenAtPath';
import { NodeItem } from './NodeItem';
import treeUrl from './tree-exported-4.json?url';
import { bookmarksTreeSchema, type DefaultNode, isNodeInsert, isNodeNewRoot } from './tree-schema';
import { moveNode } from './TreeViewUtils';

export default function BookmarksExplorer() {
  const [data] = createResource(() => fetch(treeUrl).then((res) => res.json()));

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
      } else if (isNodeInsert(element)) {
        const [, nodeData, path] = element;
        if (!(nodeData as DefaultNode & { type: 'default' }).type) {
          (nodeData as DefaultNode & { type: 'default' }).type = 'default';
        }
        insertChildrenAtPath(tree, path, nodeData);
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

  return (
    <div>
      <h1>Bookmarks Explorer</h1>
      <button class="rounded-2xl border px-2" onClick={history.undo}>
        Undo
      </button>
      <button class="rounded-2xl border px-2" onClick={history.redo}>
        Redo
      </button>
      <DragAndDropProvider
        onMoveNode={(from, to) => {
          console.log('Move node from', from, 'to', to);
          setState(
            produce((tree) => {
              moveNode(tree, from, to);
            })
          );
        }}
      >
        <DragAndDropConsumer>
          {({ dropHandlers, rect, hasSubnodes, dragging }) => (
            <>
              <ul {...dropHandlers}>
                <NodeItem node={state} path={[]} />
              </ul>
              <Show when={dragging()}>
                <DragFeedback rect={rect()} hasSubnodes={hasSubnodes()} />
              </Show>
            </>
          )}
        </DragAndDropConsumer>
      </DragAndDropProvider>
    </div>
  );
}
