import type { Part } from './board';
import type { LegoServices } from './LegoServices';
import { resolveLook } from './looks';
import { actionParts } from './parts/actions';
import { colorParts } from './parts/colors';
import type { PartDefinition } from './parts/definition';
import { presetPart } from './parts/presets';
import { valueParts } from './parts/values';

/** The only catalogue of part kinds. Definitions are inert until a frame runs their bindings. */
export const partDefinitions: readonly PartDefinition[] = [...actionParts, ...colorParts, ...valueParts, presetPart];

/** Exact lookups reject inherited property names; only preset IDs use an open suffix. */
export function partDefinition(kind: string) {
  return (
    partDefinitions.find((definition) => definition.kind === kind) ??
    (kind.startsWith('preset:') && kind.length > 'preset:'.length ? presetPart : undefined)
  );
}

/** Box order and kind lists come from the definitions, preserving stored identifiers. */
export const boxSections = ['Tools', 'Color', 'Values'].map((title) => ({
  id: title,
  title,
  kinds: partDefinitions.filter((definition) => definition.section === title).map((definition) => definition.kind)
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
