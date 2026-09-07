import type { BrushEngine, BrushSession } from './contracts';

/** Pairs a worker-side decoder with a typed engine and its UI-side selection constructor.
 * Settings are decoded before creating GPU stroke state. Keep large textures in the engine's resource cache;
 * settings should reference those resources by ID, not contain a second copy of the texture on every stroke.
 */
export function defineBrushEngine<const Id extends string, Settings>(definition: {
  id: Id;
  /** Validates untrusted transport input; may supply defaults for undefined legacy selections. */
  parse: (input: unknown) => Settings;
  create: (context: Omit<Parameters<BrushEngine>[0], 'settings'> & { settings: Settings }) => BrushSession;
}) {
  if (!definition.id.trim()) throw new Error('A brush engine needs a nonempty ID.');
  const engine: BrushEngine = (context) =>
    definition.create({ ...context, settings: definition.parse(structuredClone(context.settings)) });
  return {
    id: definition.id,
    engine,
    /** Copies and validates settings before transport. Throws for invalid or non-cloneable configuration. */
    select(settings: Settings) {
      return { id: definition.id, settings: structuredClone(definition.parse(settings)) };
    }
  };
}

/** Small transport envelope; each registered engine validates its own settings after delivery. */
export type BrushEngineSelection = { id: string; settings: unknown };
