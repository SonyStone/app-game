import { isAttributeRecognized, isRecognizedElement, isValidChild, validChildren } from '../svg-db';
import { getAttribute, hasAttribute, type SvgElementNode } from '../svg-model';
import { colorToHex } from './colors';

/** A GodSVG message in English with its placeholder values, translated where it is shown. */
export type WarningMessage = { readonly text: string; readonly values?: Readonly<Record<string, string>> };

/** One warning: its messages are shown together, separated by a space. */
export type ElementWarning = readonly WarningMessage[];

/**
 * GodSVG's element configuration warnings: an element under a parent where it has no effect, a missing or invalid
 * radius, an empty or single-element group, and a gradient without stops, without an `id`, or of a single color.
 */
export function elementWarnings(element: SvgElementNode, parent: SvgElementNode | undefined): readonly ElementWarning[] {
  const warnings: ElementWarning[] = [];

  if (parent && !isValidChild(parent.name, element.name)) {
    const allowed = validParents(element.name);
    warnings.push([
      { text: '{element} must be inside {allowed} to have any effect.', values: { element: element.name, allowed: `[${allowed.join(', ')}]` } }
    ]);
  }

  switch (element.name) {
    case 'circle':
      warnings.push(...radiusWarnings(element, 'r', false));
      break;
    case 'ellipse':
      warnings.push(...radiusWarnings(element, 'rx', true), ...radiusWarnings(element, 'ry', true));
      break;
    case 'g':
      if (element.children.length === 0) {
        warnings.push([{ text: 'This group has no elements.' }]);
      } else if (element.children.length === 1) {
        warnings.push([{ text: 'This group has only one element.' }]);
      }
      break;
    case 'linearGradient':
    case 'radialGradient':
      warnings.push(...gradientWarnings(element));
      break;
  }

  return warnings;
}

function validParents(name: string): readonly string[] {
  return Object.entries(validChildren)
    .filter(([, children]) => (children as readonly string[]).includes(name))
    .map(([parent]) => parent);
}

function radiusWarnings(element: SvgElementNode, name: string, mayBeInterpreted: boolean): readonly ElementWarning[] {
  if (!hasAttribute(element, name)) {
    const missing: WarningMessage = { text: 'No "{attribute_name}" attribute defined.', values: { attribute_name: name } };
    // A missing ellipse radius falls back to the other one in SVG 2 but means zero in SVG 1.1 renderers.
    return [mayBeInterpreted ? [missing, { text: 'This may be interpreted differently by different SVG software.' }] : [missing]];
  }

  const value = getAttribute(element, name, true).trim();
  const number = Number(value);
  const values = { attribute_name: name, attribute_value: value };

  if (value === '' || !Number.isFinite(number) || number < 0) {
    return [[{ text: 'Attribute "{attribute_name}" has invalid value "{attribute_value}".', values }]];
  }

  return number === 0 ? [[{ text: 'Attribute "{attribute_name}" has value "{attribute_value}" and will not render.', values }]] : [];
}

/**
 * GodSVG's gradient checks. The gradient is a solid color unless some stop after the first differs from it (in color or
 * opacity, and not both fully transparent) and starts at a larger offset than the stop before it.
 */
function gradientWarnings(element: SvgElementNode): readonly ElementWarning[] {
  const warnings: ElementWarning[] = [];

  if (!hasAttribute(element, 'id')) {
    warnings.push([{ text: 'No "{attribute_name}" attribute defined.', values: { attribute_name: 'id' } }]);
  }

  const stops = element.children.filter((child): child is SvgElementNode => child.kind === 'element' && child.name === 'stop');
  const first = stops[0];

  if (!first) {
    warnings.push([{ text: 'No <stop> elements under this gradient.' }]);
    return warnings;
  }

  const initial = stopProperties(first);
  let previousOffset = initial.offset;
  let transition = false;

  for (const stop of stops.slice(1)) {
    const current = stopProperties(stop);
    transition =
      !(current.color === initial.color && current.opacity === initial.opacity) && (initial.opacity !== 0 || current.opacity > 0);

    if (transition && current.offset > previousOffset) {
      break;
    }

    previousOffset = current.offset;
  }

  if (!transition) {
    warnings.push([{ text: 'This gradient is a solid color.' }]);
  }

  return warnings;
}

function stopProperties(stop: SvgElementNode): { readonly offset: number; readonly opacity: number; readonly color: string } {
  const color = getAttribute(stop, 'stop-color');

  return {
    offset: clampUnit(getAttribute(stop, 'offset')),
    opacity: clampUnit(getAttribute(stop, 'stop-opacity')),
    color: colorToHex(color) ?? color.trim().toLowerCase()
  };
}

/** A number or percentage clamped to 0–1, as stop offsets and opacities are. */
function clampUnit(value: string): number {
  const text = value.trim();
  const number = text.endsWith('%') ? Number.parseFloat(text) / 100 : Number(text);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : 0;
}

/** What GodSVG's import dialog lists: element and attribute names it doesn't recognize, each once, in document order. */
export function importProblems(root: SvgElementNode): { readonly elements: readonly string[]; readonly attributes: readonly string[] } {
  const elements = new Set<string>();
  const attributes = new Set<string>();

  function visit(element: SvgElementNode): void {
    if (element !== root && !isRecognizedElement(element.name)) {
      elements.add(element.name);
    } else {
      for (const attribute of element.attrs) {
        if (!isAttributeRecognized(element.name, attribute.name)) {
          attributes.add(attribute.name);
        }
      }
    }

    for (const child of element.children) {
      if (child.kind === 'element') {
        visit(child);
      }
    }
  }

  visit(root);
  return { elements: [...elements], attributes: [...attributes] };
}
