// Color utilities for console.log styling
const colors = {
  add: '#4ade80', // green - for adding operations
  remove: '#f87171', // red - for removing operations
  replace: '#fbbf24', // yellow - for replace operations
  insert: '#60a5fa', // blue - for insert operations
  adjacent: '#a78bfa', // purple - for adjacent operations
  content: '#fb923c', // orange - for content setters
  node: '#94a3b8' // gray - for node info
} as const;

const styled = (styled: (string | [string, string])[]) => {
  const text: string[] = [];
  const combinedStyles: (string | undefined)[] = [];

  for (const item of styled) {
    if (typeof item === 'string') {
      text.push(item);
      combinedStyles.push(undefined);
    } else {
      const [t, c] = item;
      text.push(t);
      combinedStyles.push(c);
    }
  }

  const combinedText = text.map((t) => `%c${t}`).join(' ');
  return [combinedText, ...combinedStyles] as const;
};

const getNodeInfo = (node: Node) => {
  if (node instanceof Element) {
    const tagName = node.tagName.toLowerCase();
    const id = node.id ? `#${node.id}` : '';
    const classes = node.className ? `.${node.className.split(' ').join('.')}` : '';
    const childCount = node.childNodes.length;

    let childrenInfo = '';
    if (childCount === 0) {
      childrenInfo = ' (empty)';
    } else if (childCount === 1 && node.childNodes[0] instanceof Text) {
      const text = node.childNodes[0].textContent?.trim() ?? '';
      if (text.length > 0) {
        childrenInfo = ` ("${text.substring(0, 20)}${text.length > 20 ? '...' : ''}")`;
      }
    } else {
      const elementChildren = Array.from(node.children).map((child) => child.tagName.toLowerCase());
      const textChildren = Array.from(node.childNodes).filter(
        (child) => child instanceof Text && child.textContent?.trim()
      ).length;
      if (elementChildren.length > 0 || textChildren > 0) {
        const parts = [];
        if (elementChildren.length > 0) {
          parts.push(elementChildren.slice(0, 3).join(', ') + (elementChildren.length > 3 ? '...' : ''));
        }
        if (textChildren > 0) {
          parts.push(`${textChildren} text`);
        }
        childrenInfo = ` [${parts.join(', ')}]`;
      }
    }
    return `<${tagName}${id}${childrenInfo}>`;
  }
  if (node instanceof Text) {
    return `"${node.textContent?.substring(0, 30)}${(node.textContent?.length ?? 0) > 30 ? '...' : ''}"`;
  }
  if (node instanceof Comment) {
    return `<!-- ${node.textContent?.substring(0, 20)}${(node.textContent?.length ?? 0) > 20 ? '...' : ''} -->`;
  }
  return node.nodeName;
};

const isPatched = Symbol('isPatched');

/**
 * Patches the DOM manipulation methods of a given node to log their usage.
 *
 * Very useful for debugging dynamic DOM manipulations.
 *
 * @param node The DOM element to patch.
 * @param prefix A prefix to add to the log messages.
 * @returns The patched node.
 */
export function patchLogDomManipulation(node: Element, prefix = '') {
  const appendChild = node.appendChild;

  if ((node as Element & { [isPatched]: true })[isPatched]) {
    return node;
  }
  (node as Element & { [isPatched]: true })[isPatched] = true;

  node.appendChild = ((args) => {
    console.log(
      ...styled([
        prefix,
        ['appendChild', `color: ${colors.add};font-weight: bold`],
        [getNodeInfo(node), `color: ${colors.node}`],
        '→',
        [getNodeInfo(args), `color: ${colors.node}`]
      ]),
      args
    );
    return appendChild.call(node, args);
  }) as Node['appendChild'];

  const removeChild = node.removeChild;
  node.removeChild = ((args) => {
    console.log(
      ...styled([
        prefix,
        ['removeChild', `color: ${colors.remove};font-weight: bold`],
        [getNodeInfo(node), `color: ${colors.node}`],
        '→',
        [getNodeInfo(args), `color: ${colors.node}`]
      ]),
      args
    );
    return removeChild.call(node, args);
  }) as Node['removeChild'];

  const replaceChild = node.replaceChild;
  node.replaceChild = ((newChild, oldChild) => {
    console.log(
      ...styled([
        prefix,
        ['replaceChild', `color: ${colors.replace};font-weight: bold`],
        [getNodeInfo(node), `color: ${colors.node}`],
        '→',
        [getNodeInfo(oldChild), `color: ${colors.node}`],
        '⇒',
        [getNodeInfo(newChild), `color: ${colors.node}`]
      ]),
      { newChild, oldChild }
    );
    return replaceChild.call(node, newChild, oldChild);
  }) as Node['replaceChild'];

  const insertBefore = node.insertBefore;
  node.insertBefore = ((newChild, refChild) => {
    console.log(
      ...styled([
        prefix,
        ['insertBefore', `color: ${colors.insert};font-weight: bold`],
        [getNodeInfo(node), `color: ${colors.node}`],
        '→',
        [getNodeInfo(newChild), `color: ${colors.node}`],
        'before',
        [refChild ? getNodeInfo(refChild) : 'null', `color: ${colors.node}`]
      ]),
      { newChild, refChild }
    );
    return insertBefore.call(node, newChild, refChild);
  }) as Node['insertBefore'];

  const remove = node.remove;
  node.remove = () => {
    console.log(
      ...styled([
        prefix,
        ['remove', `color: ${colors.remove};font-weight: bold`],
        [getNodeInfo(node), `color: ${colors.node}`]
      ]),
      node
    );
    remove.call(node);
  };

  const append = node.append;
  node.append = ((...args) => {
    console.log(
      ...styled([
        prefix,
        ['append', `color: ${colors.add};font-weight: bold`],
        [getNodeInfo(node), `color: ${colors.node}`],
        '→'
      ]),
      args.map((arg) => (typeof arg === 'string' ? `"${arg}"` : getNodeInfo(arg as Node))),
      args
    );
    return append.call(node, ...args);
  }) as Element['append'];

  const prepend = node.prepend;
  node.prepend = ((...args) => {
    console.log(
      ...styled([
        prefix,
        ['prepend', `color: ${colors.add};font-weight: bold`],
        [getNodeInfo(node), `color: ${colors.node}`],
        '→'
      ]),
      args.map((arg) => (typeof arg === 'string' ? `"${arg}"` : getNodeInfo(arg as Node))),
      args
    );
    return prepend.call(node, ...args);
  }) as Element['prepend'];

  const before = node.before;
  node.before = ((...args) => {
    console.log(
      ...styled([
        prefix,
        ['before', `color: ${colors.insert};font-weight: bold`],
        [getNodeInfo(node), `color: ${colors.node}`],
        '→'
      ]),
      args.map((arg) => (typeof arg === 'string' ? `"${arg}"` : getNodeInfo(arg as Node))),
      args
    );
    return before.call(node, ...args);
  }) as Element['before'];

  const after = node.after;
  node.after = ((...args) => {
    console.log(
      ...styled([
        prefix,
        ['after', `color: ${colors.insert};font-weight: bold`],
        [getNodeInfo(node), `color: ${colors.node}`],
        '→'
      ]),
      args.map((arg) => (typeof arg === 'string' ? `"${arg}"` : getNodeInfo(arg as Node))),
      args
    );
    return after.call(node, ...args);
  }) as Element['after'];

  const replaceWith = node.replaceWith;
  node.replaceWith = ((...args) => {
    console.log(
      ...styled([
        prefix,
        ['replaceWith', `color: ${colors.replace};font-weight: bold`],
        [getNodeInfo(node), `color: ${colors.node}`],
        '⇒'
      ]),
      args.map((arg) => (typeof arg === 'string' ? `"${arg}"` : getNodeInfo(arg as Node))),
      args
    );
    return replaceWith.call(node, ...args);
  }) as Element['replaceWith'];

  const replaceChildren = node.replaceChildren;
  node.replaceChildren = ((...args) => {
    console.log(
      ...styled([
        prefix,
        ['replaceChildren', `color: ${colors.replace};font-weight: bold`],
        [getNodeInfo(node), `color: ${colors.node}`],
        '→'
      ]),
      args.map((arg) => (typeof arg === 'string' ? `"${arg}"` : getNodeInfo(arg as Node))),
      args
    );
    return replaceChildren.call(node, ...args);
  }) as Element['replaceChildren'];

  const insertAdjacentElement = node.insertAdjacentElement;
  node.insertAdjacentElement = ((position, element) => {
    console.log(
      ...styled([
        prefix,
        ['insertAdjacentElement', `color: ${colors.adjacent};font-weight: bold`],
        [getNodeInfo(node), `color: ${colors.node}`],
        '→'
      ]),
      position,
      getNodeInfo(element),
      element
    );
    return insertAdjacentElement.call(node, position, element);
  }) as Element['insertAdjacentElement'];

  const insertAdjacentHTML = node.insertAdjacentHTML;
  node.insertAdjacentHTML = ((position, html) => {
    console.log(
      ...styled([
        prefix,
        ['insertAdjacentHTML', `color: ${colors.adjacent};font-weight: bold`],
        [getNodeInfo(node), `color: ${colors.node}`],
        '→'
      ]),
      position,
      `"${html.substring(0, 50)}${html.length > 50 ? '...' : ''}"`
    );
    return insertAdjacentHTML.call(node, position, html);
  }) as Element['insertAdjacentHTML'];

  const insertAdjacentText = node.insertAdjacentText;
  node.insertAdjacentText = ((position, text) => {
    console.log(
      ...styled([
        prefix,
        ['insertAdjacentText', `color: ${colors.adjacent};font-weight: bold`],
        [getNodeInfo(node), `color: ${colors.node}`],
        '→'
      ]),
      position,
      `"${text}"`
    );
    return insertAdjacentText.call(node, position, text);
  }) as Element['insertAdjacentText'];

  const innerHTMLDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  if (innerHTMLDescriptor && innerHTMLDescriptor.set && node.innerHTML) {
    Object.defineProperty(node, 'innerHTML', {
      set(value) {
        console.log(
          ...styled([
            prefix,
            ['innerHTML', `color: ${colors.content};font-weight: bold`],
            [getNodeInfo(this as Node), `color: ${colors.node}`],
            '='
          ]),
          `"${value.substring(0, 100)}${value.length > 100 ? '...' : ''}"`
        );
        innerHTMLDescriptor.set!.call(this, value);
      },
      get: innerHTMLDescriptor.get
    });
  }

  const outerHTMLDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'outerHTML');
  if (outerHTMLDescriptor && outerHTMLDescriptor.set && node.outerHTML) {
    Object.defineProperty(node, 'outerHTML', {
      set(value) {
        console.log(
          ...styled([
            prefix,
            ['outerHTML', `color: ${colors.content};font-weight: bold`],
            [getNodeInfo(this as Node), `color: ${colors.node}`],
            '='
          ]),
          `"${value.substring(0, 100)}${value.length > 100 ? '...' : ''}"`
        );
        outerHTMLDescriptor.set!.call(this, value);
      },
      get: outerHTMLDescriptor.get
    });
  }

  const textContentDescriptor = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
  if (textContentDescriptor && textContentDescriptor.set && node.textContent) {
    Object.defineProperty(node, 'textContent', {
      set(value) {
        console.log(
          ...styled([
            prefix,
            ['textContent', `color: ${colors.content};font-weight: bold`],
            [getNodeInfo(this as Node), `color: ${colors.node}`],
            '='
          ]),
          `"${value?.substring(0, 100)}${(value?.length ?? 0) > 100 ? '...' : ''}"`
        );
        textContentDescriptor.set!.call(this, value);
      },
      get: textContentDescriptor.get
    });
  }

  return node;
}
