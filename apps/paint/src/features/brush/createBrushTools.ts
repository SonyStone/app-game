import { defaultBrush, type Brush } from '@app-game/paint-core/brush';
import type { BrushEngineSelection } from '@app-game/paint-core/composition/defineBrushEngine';
import { createImmediateSignal } from '../../shared/createImmediateSignal';

/**
 * Owns the active tool and the brush settings captured by the next stroke. The round brush and the ABR brush keep
 * separate settings, as does the eraser, restored when their tool is chosen again; colors are shared by every tool.
 * Must be created within a Solid owner.
 */
export function createBrushTools() {
  // Commands build on the last written settings, so several commands in one event compose.
  const [brush, setBrush, currentBrush] = createImmediateSignal<Brush>({
    ...defaultBrush(),
    backgroundColor: '#ffffff'
  });
  const [tool, setTool, currentTool] = createImmediateSignal<PaintTool>('brush');
  /** Settings of the tools that are not active; the active tool's settings are `brush`. */
  const profiles = { round: defaultBrush(), abr: defaultBrush(), eraser: defaultBrush() };

  return {
    brush,
    tool,
    /** Switches tools, keeping colors and restoring the chosen brush's own settings. */
    chooseTool(next: PaintTool) {
      const current = keepProfile();
      const colors = { color: current.color, backgroundColor: current.backgroundColor };
      setTool(next);
      if (next === 'abr-brush') {
        setBrush({ ...profiles.abr, ...colors, tool: 'brush' });
      } else if (next === 'brush') {
        setBrush({ ...profiles.round, ...colors, tool: 'brush' });
      } else if (next === 'eraser') {
        setBrush({ ...profiles.eraser, ...colors, tool: 'eraser', engine: undefined });
      }
    },
    /** The eraser's settings with the current colors, for the pen's eraser end; the active brush when erasing. */
    eraser(): Brush {
      const current = currentBrush();
      if (currentTool() === 'eraser') {
        return current;
      }

      const colors = { color: current.color, backgroundColor: current.backgroundColor };
      return { ...profiles.eraser, ...colors, tool: 'eraser', engine: undefined };
    },
    /** Merges changed settings into the active brush. */
    updateBrush(patch: Partial<Brush>) {
      setBrush({ ...currentBrush(), ...patch });
    },
    /** Activates the ABR brush with a preset's engine and its size, spacing, color, flow and opacity. */
    selectPreset(engine: BrushEngineSelection, settings: Partial<Brush>) {
      const current = keepProfile();
      profiles.abr = {
        ...profiles.abr,
        engine,
        color: current.color,
        backgroundColor: current.backgroundColor,
        ...settings
      };
      setTool('abr-brush');
      setBrush(profiles.abr);
    },
    /** Exchanges the foreground and background colors; a missing background color swaps in as white. */
    swapColors() {
      const current = currentBrush();
      setBrush({ ...current, color: current.backgroundColor ?? '#ffffff', backgroundColor: current.color });
    },
    resetColors() {
      setBrush({ ...currentBrush(), color: '#000000', backgroundColor: '#ffffff' });
    },
    /** Scales the brush size, limited to 1–512 px, or 1–5000 px for ABR presets. */
    scaleSize(factor: number) {
      const current = currentBrush();
      setBrush({
        ...current,
        size: Math.max(1, Math.min(current.engine?.id === 'abr' ? 5000 : 512, current.size * factor))
      });
    }
  };

  /** Stores the active brush's settings before another tool or preset replaces them. */
  function keepProfile() {
    const current = currentBrush();
    const active = currentTool();
    if (active === 'brush') {
      profiles.round = current;
    }

    if (active === 'abr-brush') {
      profiles.abr = current;
    }

    if (active === 'eraser') {
      profiles.eraser = current;
    }

    return current;
  }
}

/** Canvas tools. `brush` and `eraser` also name the brush's own `tool`; the ABR brush paints with `tool: 'brush'`. */
export type PaintTool = Brush['tool'] | 'abr-brush' | 'lasso';
