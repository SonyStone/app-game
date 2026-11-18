import type { Part } from './board';
import type { LegoServices } from './LegoServices';
import { resolveLook } from './looks';
import { actionParts } from './parts/actions';
import { colorParts } from './parts/colors';
import type { PartDefinition } from './parts/definition';
import { layerParts } from './parts/layers';
import { presetPart } from './parts/presets';
import { pressureCurvePart } from './parts/pressureCurve';
import { brushValueParts, valueParts } from './parts/values';

/** The box catalogue. Studio-only schema definitions resolve separately; all bindings remain inert until mounted. */
export const partDefinitions: readonly PartDefinition[] = [
  ...actionParts,
  ...colorParts,
  ...valueParts,
  ...layerParts,
  presetPart
];

/**
 * Exact lookups reject inherited property names; only preset IDs use an open suffix. A kind the brush studio no longer
 * offers resolves to the part that replaced it (see {@link replacedKinds}), so stored boards keep working.
 */
export function partDefinition(kind: string): PartDefinition | undefined {
  const current = currentKind(kind);

  return (
    partDefinitions.find((definition) => definition.kind === current) ??
    brushParts.find((definition) => definition.kind === current) ??
    (current.startsWith('preset:') && current.length > 'preset:'.length ? presetPart : undefined)
  );
}

/** Studio-only parts: a part per brush number setting and the pressure curve, which enter the board from the studio. */
const brushParts: readonly PartDefinition[] = [...brushValueParts, pressureCurvePart];

/**
 * Kinds of parts the brush studio once offered, by the kind that replaced them. The stabilizer's level and Leonardo's
 * stabilization became the one Smoothing level; a stored part keeps its kind and shows Smoothing.
 */
const replacedKinds: Readonly<Record<string, string>> = {
  'value:brush:stabilizer-level': 'value:brush:smoothing',
  'value:brush:stabilization': 'value:brush:smoothing'
};

/** The kind a stored part's `kind` is now: the one that replaced it, or itself. */
export function currentKind(kind: string) {
  return Object.hasOwn(replacedKinds, kind) ? replacedKinds[kind]! : kind;
}

/** Box order and kind lists come from the definitions, preserving stored identifiers. */
export const boxSections = ['Tools', 'Color', 'Values', 'Layers'].map((title) => ({
  id: title,
  title,
  kinds: partDefinitions
    .filter((definition) => definition.section === title && !definition.studioOnly)
    .map((definition) => definition.kind)
}));

/** Resolves the part's chosen or automatic look using the shared look resolver. */
export function lookOf(part: Pick<Part, 'kind' | 'span' | 'looks'>) {
  const options = partLooks(part.kind);
  return options && resolveLook(part.looks, part.span, options.looks, options.auto(part.span));
}

/** Available looks and their automatic size choice, absent for parts with a single presentation. */
export function partLooks(kind: string) {
  return partDefinition(kind)?.looks;
}

/** Names a kind from its definition or the library's preset name. Unknown identifiers remain readable. */
export function kindLabel(kind: string, presets: ReturnType<LegoServices['presets']['all']>) {
  const definition = partDefinition(kind);
  return definition?.family === 'preset'
    ? (presets.find((preset) => preset.id === kind.slice('preset:'.length))?.name ?? 'Brush')
    : (definition?.label ?? kind);
}
