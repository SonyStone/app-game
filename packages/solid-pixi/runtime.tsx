import { createRenderer } from '@solidjs/universal';
import type { JSX } from '@solidjs/web';
import { Container, type Particle, type ParticleContainer, Text } from 'pixi.js';
import { createRenderEffect } from 'solid-js';

export const { effect, memo, createComponent, createTextNode, insertNode, insert, setProp, mergeProps, ...other } =
  createRenderer<Container>({
    createElement() {
      return new Container({});
    },
    createTextNode(value) {
      return new Text({ text: value });
    },
    replaceText(textNode: Text, value) {
      textNode.text = value;
    },
    setProperty(node, name, value) {
      if (name !== 'size') {
        // @ts-expect-error // 'string' can't be used to index type
        node[name] = value;
      } else {
        // @ts-expect-error // Property 'width' does not exist on type 'NonNullable<T>'
        node.setSize(value?.width, value?.height);
      }
    },
    insertNode(parent, node, anchor) {
      if (!parent) return;
      // if (node instanceof Element) {
      //   console.warn(`Inserting an ${node.constructor.name} node directly is not supported in Pixi`);
      //   return;
      // }

      // ? Is there any other way to check if the parent is a Container or a ParticleContainer?
      // Handles ParticleContainer
      if ((parent as ParticleContainer).addParticle) {
        if (anchor) {
          (parent as ParticleContainer).addParticleAt?.(
            node as unknown as Particle,
            anchor?.parent?.children.indexOf(anchor) ?? 0
          );
        } else {
          (parent as ParticleContainer).addParticle?.(node as unknown as Particle);
        }
        return;
      }
      if (anchor) {
        parent?.addChildAt?.(node, anchor?.parent?.children.indexOf(anchor) ?? 0);
      } else {
        parent?.addChild?.(node);
      }
    },
    isTextNode(node) {
      return node?.constructor.name === 'Text';
    },
    removeNode(parent, node) {
      // Handles ParticleContainer
      if ((parent as ParticleContainer).addParticle) {
        (parent as ParticleContainer).removeParticle?.(node as unknown as Particle);
        return;
      }

      node?.removeFromParent();
    },
    getParentNode(node) {
      return node?.parent ?? undefined;
    },
    getFirstChild(node) {
      return node?.children?.[0];
    },
    getNextSibling(node) {
      return node?.parent?.children?.[node?.parent?.children?.indexOf(node) + 1];
    }
  });

function applySpreadProps(node: unknown, props: any, previousProps: any, wasRenderable: boolean) {
  if (!wasRenderable && props.renderable === false) return wasRenderable;

  if (props.ref !== previousProps.ref) {
    props.ref?.(node);
    previousProps.ref = props.ref;
  }
  for (const prop in props) {
    if (prop === 'children' || prop === 'ref') continue;
    const value = props[prop];
    if (value === previousProps[prop]) continue;
    setProp(node as any, prop, value, previousProps[prop]);
    previousProps[prop] = value;
  }

  return props.renderable ?? true;
}

function readSpreadProps(props: any) {
  const values: any = {};
  for (const prop in props) values[prop] = props[prop];
  return values;
}

export function _spread<T>(node: unknown, accessor: T | (() => T)) {
  if (typeof accessor === 'function') {
    const previousProps: any = {};
    let renderable = true;
    createRenderEffect(
      () => readSpreadProps((accessor as () => T)()),
      (props) => {
        renderable = applySpreadProps(node, props, previousProps, renderable);
      }
    );
  } else {
    applySpreadProps(node, accessor, {}, true);
  }
}

export const spread = _spread;

// export const render = other.render as (fn: () => JSXElement, ctx: ViteHotContext) => () => void
// const hotCtxMap = new Map<ViteHotContext, Array<() => void>>()
// export const render = (code: () => JSX.Element, hotCtx?: ViteHotContext) => {
//   let disposer: () => void = () => void 0
//   createRoot(dispose => {
//     const elem = insert(null, code())
//     disposer = () => {
//       dispose()
//       elem?.destroy?.()
//     }
//     if (hotCtx) {
//       hotCtxMap.set(hotCtx, [...(hotCtxMap.get(hotCtx) ?? []), disposer])
//       hotCtx.dispose(() => {
//         hotCtxMap.get(hotCtx!)?.forEach(v => v())
//         hotCtxMap.delete(hotCtx!)
//       })
//     }
//   })

//   return disposer
// }
/**
 * Renders a Solid Pixi application
 * Handles cleanup and disposal of rendered elements.
 *
 * @param code - A function that returns a JSX element to render
 * @returns A dispose function that cleans up the rendered element
 */
export const render = other.render as unknown as (application: () => JSX.Element) => () => void;
