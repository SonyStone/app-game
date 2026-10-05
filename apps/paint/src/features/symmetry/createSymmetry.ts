import { symmetryFeature } from '@app-game/paint-core/composition/symmetryFeature';
import type { PaintCommand } from '@app-game/paint-core/protocol';
import { defaultPaintSymmetry, type PaintSymmetry } from '@app-game/paint-core/symmetry';
import { createSignal, latest, type Accessor } from 'solid-js';

/**
 * The UI half of the paint symmetry feature: guides and mirrored stroke copies, whose engine half is `symmetryFeature`
 * in the drawing engine's recipe. It resets to the symmetry of a document the engine loads, and otherwise changes
 * only through `update`. Must be created within a Solid owner.
 */
export function createSymmetry(options: {
  /** Feature data of the loaded document; without symmetry data the current settings stay. */
  restored: Accessor<Readonly<Record<string, unknown>> | undefined>;
  /** Whether document commands are accepted. */
  canUpdate: Accessor<boolean>;
  send: (command: Extract<PaintCommand, { type: 'feature' }>) => void;
}) {
  const [symmetry, setSymmetry] = createSignal<PaintSymmetry>(
    (previous) => symmetryFeature.read(options.restored()) ?? previous ?? defaultPaintSymmetry()
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

      const command = symmetryFeature.command(settings);
      setSymmetry(command.command);
      options.send(command);
      return true;
    }
  };
}
