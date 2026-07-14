import { getAttribute, hasAttribute, type SvgElementNode } from '../svg-model';

export function getSvgAttribute(node: SvgElementNode, name: string, defaultValue = ''): string {
  if (hasAttribute(node, name)) {
    return getAttribute(node, name, true);
  }

  return defaultValue;
}
