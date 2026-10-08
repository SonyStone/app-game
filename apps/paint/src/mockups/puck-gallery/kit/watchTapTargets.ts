/**
 * Keeps Chrome's touch adjustment from moving a finger's press off custom controls. Chrome moves a press to a nearby
 * element that "responds to clicks", and an element whose handlers Solid delegates to the root has no listener of
 * its own, so a press on a hue ring or a pie's backdrop beside a `<button>` would land on the button. Watches `root`
 * and gives every element with a delegated `pointerdown` handler (Solid keeps it as `_$$pointerdown`) an empty native
 * click listener, which makes it a tap target of its own. Returns a function that stops watching.
 */
export function watchTapTargets(root: Element) {
  const mark = (element: Element) => {
    if (!marked.has(element) && (element as unknown as Record<string, unknown>)[delegatedKey]) {
      marked.add(element);
      element.addEventListener('click', ignore);
    }
  };
  const markTree = (element: Element) => {
    mark(element);
    element.querySelectorAll('*').forEach(mark);
  };
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach((node) => node instanceof Element && markTree(node));
    }
  });

  observer.observe(root, { childList: true, subtree: true });
  markTree(root);
  return () => observer.disconnect();
}

/** Where Solid's runtime keeps an element's delegated `pointerdown` handler. */
const delegatedKey = '_$$pointerdown';
const marked = new WeakSet<Element>();

function ignore() {}
