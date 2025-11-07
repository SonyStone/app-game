import { ImageCache, ImageCacheProvider } from '@packages/math-examples/tree-struct/ImageCache';
import { Tree } from '@packages/math-examples/tree-struct/tree';
import { trackStore } from '@solid-primitives/deep';
import { createUndoHistory } from '@solid-primitives/history';
import { createEffect, createMemo, createResource, Show } from 'solid-js';
import { createStore, produce, reconcile, unwrap } from 'solid-js/store';
import type { BookmarksTreeView } from './BookmarksTreeView.type';
import { DragAndDropConsumer, DragAndDropProvider } from './createDragHandler';
import { DragFeedback } from './DragFeedback';
import { insertChildrenAtPath } from './insertChildrenAtPath';
import { NodeItem2 } from './NodeItem';
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
        tree.id = index;
      } else if (isNodeInsert(element)) {
        const [, nodeData, path] = element;
        if (!(nodeData as DefaultNode & { type: 'default' }).type) {
          (nodeData as DefaultNode & { type: 'default' }).type = 'default';
        }
        nodeData.id = index;
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
      <ImageCacheProvider>
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
                  <Tree root={state}>
                    {(props) => {
                      return (
                        <div class="contents">
                          <NodeItem2 node={props.node} path={props.path}>
                            {props.children}
                          </NodeItem2>
                          <ImageCache
                            height={20}
                            width={20}
                            src={`https://api.dicebear.com/6.x/thumbs/svg?seed=${props.node.id}`}
                          />
                        </div>
                      );
                    }}
                  </Tree>
                </ul>
                <Show when={dragging()}>
                  <DragFeedback rect={rect()} hasSubnodes={hasSubnodes()} />
                </Show>
              </>
            )}
          </DragAndDropConsumer>
        </DragAndDropProvider>
      </ImageCacheProvider>
    </div>
  );
}
