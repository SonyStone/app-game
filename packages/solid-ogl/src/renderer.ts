import { Camera, Geometry, Mesh, Polyline, Program, Transform } from 'ogl';
import { createRenderEffect, getOwner, runWithOwner } from 'solid-js';
import { createRenderer } from 'solid-js/universal';
import { resolveRegistration, toTagName } from './registry';
import {
  applyPropertyValue,
  getRoot,
  getValueAtPath,
  insertChildAt,
  isTransform,
  parsePath,
  setValueAtPath,
} from './shared';
import type {
  AnyInstance,
  OglHostNode,
  OglNode,
  OglParent,
  OglRoot,
  OglRuntimeProps,
  OglTextNode,
} from './types';

const RESERVED_PROPS = new Set([
  'args',
  'attach',
  'children',
  'makeDefault',
  'ref',
]);

const updateDefaultCamera = (node: OglNode) => {
  const root = node.root;

  if (!root || !(node.instance instanceof Camera)) {
    return;
  }

  node.restoreDefaultCamera?.();
  node.restoreDefaultCamera = undefined;

  if (node.props.makeDefault) {
    const previous = root.state.camera();
    root.state.setCamera(node.instance);
    node.restoreDefaultCamera = () => {
      root.state.setCamera(previous);
    };
  }
};

const isRenderableMesh = (node: OglNode) => {
  if (!(node.instance instanceof Mesh)) {
    return true;
  }

  return Boolean(node.instance.geometry && node.instance.program);
};

const resolveTransformChild = (instance: unknown) => {
  if (instance instanceof Polyline) {
    return instance.mesh;
  }

  return instance instanceof Transform ? instance : undefined;
};

const maybeAttachNode = (node: OglNode) => {
  if (node.attachment || !node.parent || !isRenderableMesh(node)) {
    return;
  }

  attachNode(node.parent, node);
};

const applyNodeProp = (node: OglNode, name: string, value: unknown) => {
  if (name === 'ref') {
    if (typeof value === 'function' && node.instance !== undefined) {
      const owner = node.owner as
        | Parameters<typeof runWithOwner>[0]
        | undefined;

      if (owner) {
        runWithOwner(owner, () => value(node.instance));
      } else {
        value(node.instance);
      }
    }
    return;
  }

  if (RESERVED_PROPS.has(name) || !node.instance) {
    if (name === 'makeDefault') {
      updateDefaultCamera(node);
      node.root?.state.invalidate();
    }
    return;
  }

  applyPropertyValue(node.instance as AnyInstance, name, value);
  node.root?.state.invalidate();
};

const resolveAttachmentPath = (parentInstance: unknown, node: OglNode) => {
  if (node.props.attach && typeof node.props.attach === 'string') {
    return parsePath(node.props.attach);
  }

  if (parentInstance instanceof Mesh) {
    if (node.instance instanceof Geometry) {
      return ['geometry'];
    }

    if (node.instance instanceof Program) {
      return ['program'];
    }
  }

  return undefined;
};

const detachNode = (node: OglNode) => {
  const parentNode = node.parent?.kind === 'node' ? node.parent : undefined;

  if (!node.attachment) {
    if (parentNode && !isRenderableMesh(parentNode)) {
      detachNode(parentNode);
    }
    return;
  }

  if (node.attachment.kind === 'transform') {
    node.attachment.parent.removeChild(node.attachment.child);
  } else {
    setValueAtPath(
      node.attachment.owner,
      node.attachment.path,
      node.attachment.previous,
    );
  }

  node.attachment = undefined;
  node.restoreDefaultCamera?.();
  node.restoreDefaultCamera = undefined;
  node.root?.state.invalidate();

  if (parentNode && !isRenderableMesh(parentNode)) {
    detachNode(parentNode);
  }
};

const attachNode = (parent: OglParent, node: OglNode) => {
  const root = getRoot(parent);
  if (!root || !node.instance || !isRenderableMesh(node)) {
    return;
  }

  const parentInstance =
    parent.kind === 'root' ? root.state.scene : parent.instance;
  if (!parentInstance) {
    return;
  }

  const childTransform = resolveTransformChild(node.instance);

  if (childTransform && isTransform(parentInstance)) {
    childTransform.setParent(parentInstance);
    node.attachment = {
      kind: 'transform',
      parent: parentInstance,
      child: childTransform,
    };
  } else {
    const path = resolveAttachmentPath(parentInstance, node);
    if (!path) {
      return;
    }

    node.attachment = {
      kind: 'property',
      owner: parentInstance as AnyInstance,
      path,
      previous: getValueAtPath(parentInstance as AnyInstance, path),
    };
    setValueAtPath(parentInstance as AnyInstance, path, node.instance);
  }

  updateDefaultCamera(node);
  root.state.invalidate();

  if (parent.kind === 'node') {
    maybeAttachNode(parent);
  }
};

const instantiateNode = (node: OglNode, root: OglRoot) => {
  if (node.instance) {
    return;
  }

  const registration =
    resolveRegistration(node.type) ?? resolveRegistration(toTagName(node.type));
  if (!registration) {
    throw new Error(
      `Unknown OGL intrinsic \"${node.type}\". Register it with extend().`,
    );
  }

  const args = Array.isArray(node.props.args) ? [...node.props.args] : [];
  const constructorArgs = registration.requiresGl
    ? [root.state.gl, ...args]
    : args;
  node.instance = new registration.constructor(...constructorArgs);
  node.root = root;

  for (const [name, value] of Object.entries(node.props)) {
    applyNodeProp(node, name, value);
  }
};

const mountNode = (parent: OglParent, node: OglNode) => {
  const root = getRoot(parent);
  if (!root) {
    return;
  }

  node.root = root;
  instantiateNode(node, root);

  for (const child of node.children) {
    mountNode(node, child);
  }

  attachNode(parent, node);
};

const isTextNode = (node: OglHostNode): node is OglTextNode =>
  node.kind === 'text';

const oglRenderer: any = createRenderer({
  createElement(type: string): OglNode {
    return {
      kind: 'node',
      type,
      parent: null,
      children: [],
      props: {},
      owner: getOwner(),
    };
  },
  createTextNode(value: string): OglTextNode {
    return {
      kind: 'text',
      value,
      parent: null,
    };
  },
  replaceText(node: OglTextNode, value: string) {
    node.value = value;
  },
  setProperty(node: OglHostNode, name: string, value: unknown) {
    if (isTextNode(node)) {
      return;
    }

    node.props[name] = value;
    applyNodeProp(node, name, value);

    if (name === 'attach' && node.parent) {
      detachNode(node);
      attachNode(node.parent, node);
    }
  },
  insertNode(
    parent: OglParent | null,
    node: OglHostNode,
    anchor?: OglHostNode,
  ) {
    if (!parent || isTextNode(node)) {
      return;
    }

    insertChildAt(
      parent.children,
      node,
      anchor && !isTextNode(anchor) ? anchor : undefined,
    );
    node.parent = parent;
    mountNode(parent, node);
  },
  isTextNode,
  removeNode(parent: OglParent | null, node: OglHostNode) {
    if (!parent || isTextNode(node)) {
      return;
    }

    detachNode(node);
    node.parent = null;
    const index = parent.children.indexOf(node);
    if (index !== -1) {
      parent.children.splice(index, 1);
    }
  },
  getParentNode(node: OglHostNode) {
    return node.parent;
  },
  getFirstChild(node: OglParent) {
    return node.children[0];
  },
  getNextSibling(node: OglHostNode) {
    const parent = node.parent;
    if (!parent || isTextNode(node)) {
      return undefined;
    }

    const siblings = parent.children;
    const index = siblings.indexOf(node);
    return index === -1 ? undefined : siblings[index + 1];
  },
} as any);

const spreadExpression = (
  node: OglHostNode,
  props: OglRuntimeProps = {},
  prevProps: OglRuntimeProps = {},
) => {
  createRenderEffect(() => {
    if (isTextNode(node)) {
      return;
    }

    for (const [name, value] of Object.entries(props)) {
      if (value === prevProps[name]) {
        continue;
      }

      oglRenderer.setProp(node, name, value, prevProps[name]);
      prevProps[name] = value;
    }
  });

  return prevProps;
};

export const spread = <T>(node: OglHostNode, accessor: T | (() => T)) => {
  if (typeof accessor === 'function') {
    const getter = accessor as () => T;
    createRenderEffect((current) =>
      spreadExpression(
        node,
        getter() as OglRuntimeProps,
        current as OglRuntimeProps,
      ),
    );
    return;
  }

  spreadExpression(node, accessor as OglRuntimeProps, undefined);
};

export const {
  effect,
  memo,
  createComponent,
  createElement,
  createTextNode,
  insertNode,
  insert,
  setProp,
  mergeProps,
  use,
  render,
} = oglRenderer;
