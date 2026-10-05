import { record } from '@app-game/abr-brush/form';
import type { AbrBrushCommand } from '@app-game/abr-paint/commands';
import type { Brush } from '@app-game/paint-core/brush';
import type { Point } from '@app-game/paint-core/camera';
import type { Result } from 'neverthrow';
import { createSignal, latest, type Accessor } from 'solid-js';
import { engineError, type PaintError } from '../../shared/errors';
import type { PaintTool } from './createBrushTools';

/**
 * Mixer Brush reservoir commands for the selected native Mixer Brush preset: load, clean, and load paint from the
 * canvas with the next contact. Must be created within a Solid owner.
 */
export function createMixerBrush(options: {
  brush: Accessor<Brush>;
  tool: Accessor<PaintTool>;
  /** Sends a brush command to the engine; see `PaintEngine.runBrushCommand`. */
  run: (brush: Brush, command: AbrBrushCommand) => Promise<Result<void, PaintError>>;
  /** Whether a command may start now: the engine is idle and no stroke, selection or preset upload is running. */
  canRun: () => boolean;
  onError: (error: PaintError) => void;
}) {
  const [picking, setPicking] = createSignal(false);
  const available = () =>
    options.tool() === 'brush' &&
    options.brush().engine?.id === 'abr' &&
    record(record(record(options.brush().engine?.settings).values).tool).type === 'MixB';

  return {
    /** The selected preset is a native Mixer Brush. */
    available,
    /** The next canvas contact loads paint instead of painting. */
    picking,
    command,
    /** Arms a single canvas contact, for tablets without an Alt/Option key. Escape cancels it. */
    pick() {
      if (latest(available) && options.canRun()) {
        setPicking(true);
      }
    },
    cancelPick() {
      setPicking(false);
    },
    /** Canvas contact handler: an armed pick or an Alt/Option-click loads paint at the contact point. */
    canvasAction: {
      enabled: (event: Pick<PointerEvent, 'altKey'>) => available() && (picking() || event.altKey),
      run(point: Point) {
        setPicking(false);
        void command({ type: 'load-canvas', point });
      }
    }
  };

  /**
   * Runs a reservoir command with the current brush. A command requested while Paint is busy is reported as a
   * retryable `busy` error rather than silently dropped.
   */
  async function command(next: AbrBrushCommand) {
    if (!options.canRun()) {
      options.onError(engineError('busy', 'Wait for the current drawing operation to finish, then try again.'));
      return;
    }

    const result = await options.run(latest(options.brush), next);
    if (result.isErr()) {
      options.onError(result.error);
    }
  }
}
