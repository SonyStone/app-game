import type { SvgAttribute } from '../../svg-model';

/**
 * Namespace forced on every rendered document node.
 *
 * Solid creates tags outside its built-in SVG list (`iframe`, `img`, `div`, …) as HTML elements, and a node's own
 * `xmlns` attribute could switch it to HTML as well. Forcing the SVG namespace keeps such nodes inert.
 */
export const svgNamespace = 'http://www.w3.org/2000/svg';

/**
 * Reports whether the editor may mount this document element in its own page.
 *
 * `script` would run inside the editor, and `style` would restyle the whole editor because inline SVG styles are not
 * scoped. The document model keeps these nodes; only the live view skips them.
 */
export function isRenderableElement(name: string): boolean {
  return !blockedElements.has(name.toLowerCase());
}

const blockedElements = new Set(['script', 'style']);

/**
 * Returns the attributes that are safe to apply to a live view node.
 *
 * Drops event handler attributes (`on*`) and `javascript:` URLs in any attribute, which also covers animation values
 * such as `<set to="javascript:…">`. Drops `href` on links so a click in the editor never navigates away.
 */
export function renderableAttributes(elementName: string, attrs: readonly SvgAttribute[]): readonly SvgAttribute[] {
  const isLink = elementName.toLowerCase() === 'a';

  return attrs.filter((attr) => {
    const name = attr.name.toLowerCase();

    if (name.startsWith('on') || isJavascriptUrl(attr.value)) {
      return false;
    }

    return !(isLink && (name === 'href' || name === 'xlink:href'));
  });
}

function isJavascriptUrl(value: string): boolean {
  // Browsers ignore ASCII whitespace and control characters inside the URL scheme.
  // eslint-disable-next-line no-control-regex
  return /^javascript:/i.test(value.replace(/[\u0000- ]/g, ''));
}
