import { AnyTreeView } from './AnyTreeView';

/**
 * Inserts children at the specified path in the tree.
 * @param tree any tree view with 'children' property
 * @param path an array of numbers representing the path to the insertion point
 * @param nodeData the node data to insert
 * @returns void
 */
export function insertChildrenAtPath(tree: AnyTreeView<'children'>, path: number[], nodeData: AnyTreeView<'children'>) {
  let currentNode = tree;

  const lastPathIndex = path.length - 1;
  for (let i = 0; i < path.length; i++) {
    const index = path[i];
    if (!currentNode.children) {
      currentNode.children = [];
    }
    if (i === lastPathIndex) {
      currentNode.children[index] = nodeData;
      break;
    }
    if (!currentNode.children[index]) {
      currentNode.children[index] = {};
    }
    currentNode = currentNode.children[index];
  }
}
