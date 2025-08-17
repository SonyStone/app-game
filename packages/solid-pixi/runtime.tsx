import { Container, type Particle, type ParticleContainer, Text } from 'pixi.js';
import { type JSX, createRenderEffect } from 'solid-js';
import { createRenderer } from 'solid-js/universal';

export const { effect, memo, createComponent, createTextNode, insertNode, insert, setProp, mergeProps, use, ...other } =
  createRenderer<Container>({
    createElement(string) {
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
      if (node instanceof Element) {
        console.warn(`Inserting an ${node.constructor.name} node directly is not supported in Pixi`);
        return;
      }

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

function spreadExpression(node: any, props: any = {}, prevProps: any = {}) {
  let renderable = props?.renderable ?? true;
  createRenderEffect(() => props.ref?.(node));
  createRenderEffect(() => {
    // Makes sure that we render one last time before the component's `renderable` prop is set to `true`, and then
    // stops until its `renderable` prop is set to `false` again.
    if (!renderable && props.renderable === false) return;
    for (const prop in props) {
      if (prop === 'children' || prop === 'ref') continue;
      const value = props[prop];
      if (value === prevProps[prop]) continue;
      setProp(node, prop, value, prevProps[prop]);
      prevProps[prop] = value;
    }

    renderable = props.renderable ?? true;
  });
  return prevProps;
}
export function _spread<T>(node: any, accessor: T | (() => T)) {
  if (typeof accessor === 'function') {
    createRenderEffect((current) =>
      // @ts-expect-error // This expression is not callable.
      spreadExpression(node, accessor(), current)
    );
  } else spreadExpression(node, accessor, undefined);
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
export const render = other.render as (application: () => JSX.Element) => () => void;
