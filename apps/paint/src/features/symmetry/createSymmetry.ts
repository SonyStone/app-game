import type { PaintCommand } from '@app-game/paint-core/protocol';
import { defaultPaintSymmetry, paintSymmetrySchema, type PaintSymmetry } from '@app-game/paint-core/symmetry';
import { createSignal, latest, type Accessor } from 'solid-js';

/**
 * Owns the document's paint symmetry: guides and mirrored stroke copies. It resets to `restored` when the engine
 * loads a document that reports symmetry, and otherwise changes only through `update`.
 * Must be created within a Solid owner.
 */
export function createSymmetry(options: {
  /** Symmetry stored with the loaded document; `undefined` keeps the current settings. */
  restored: Accessor<PaintSymmetry | undefined>;
  /** Whether document commands are accepted. */
  canUpdate: Accessor<boolean>;
  send: (command: Extract<PaintCommand, { type: 'symmetry' }>) => void;
}) {
  const [symmetry, setSymmetry] = createSignal<PaintSymmetry>(
    (previous) => options.restored() ?? previous ?? defaultPaintSymmetry()
  );

  return {
    symmetry,
    /**
     * Validates and applies new settings; they are saved with the document but are not an undo step. Returns false,
     * leaving the guide unchanged, while document commands are suspended.
     */
    update(settings: PaintSymmetry): boolean {
      if (!latest(options.canUpdate)) {
        return false;
      }

      const next = paintSymmetrySchema.parse(settings);
      setSymmetry(next);
      options.send({ type: 'symmetry', settings: next });
      return true;
    }
  };
}
