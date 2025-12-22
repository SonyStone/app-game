import { JSX, children, createEffect, createSignal } from 'solid-js';

/**
 * Allows to delay the mounting of children into the DOM
 * until after all parent elements have mounted to the DOM.
 *
 * Don't have much of a use, was used just for some <img/> loading issues on img move in the DOM.
 *
 */
export function OnMount(props: { children: JSX.Element }) {
  const resolved = children(() => props.children);
  const [node, setNode] = createSignal<JSX.Element>(null);

  createEffect(() => {
    setNode(resolved());
  });

  return node as unknown as JSX.Element;
}
