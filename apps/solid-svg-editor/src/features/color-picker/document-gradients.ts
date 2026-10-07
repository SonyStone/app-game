import { colorToHex } from '../../editor/colors';
import { flattenElements, getAttribute, type SvgElementNode } from '../../svg-model';

/** A gradient in the document that a paint attribute can reference as `url(#id)`. */
export type GradientOption = {
  readonly id: string;
  readonly kind: 'linear' | 'radial';
  /** CSS background approximating the gradient, for swatches. */
  readonly preview: string;
};

/** Linear and radial gradients that have an id, in document order, with CSS previews built from their stops. */
export function documentGradients(root: SvgElementNode): readonly GradientOption[] {
  return flattenElements(root).flatMap((element) => {
    const id = getAttribute(element, 'id', true);
    const kind = element.name === 'linearGradient' ? 'linear' : element.name === 'radialGradient' ? 'radial' : undefined;

    if (!id || !kind) {
      return [];
    }

    return [{ id, kind, preview: gradientPreview(element, kind) }];
  });
}

function gradientPreview(element: SvgElementNode, kind: 'linear' | 'radial'): string {
  const stops = element.children.flatMap((child) => {
    if (child.kind !== 'element' || child.name !== 'stop') {
      return [];
    }

    const color = colorToHex(getAttribute(child, 'stop-color')) ?? 'transparent';
    const offset = Number.parseFloat(getAttribute(child, 'offset')) || 0;
    const percent = getAttribute(child, 'offset').trim().endsWith('%') ? offset : offset * 100;
    return [`${color} ${percent}%`];
  });
  const list = stops.length > 0 ? stops.join(', ') : 'transparent, transparent';

  return kind === 'linear' ? `linear-gradient(90deg, ${list})` : `radial-gradient(circle, ${list})`;
}
