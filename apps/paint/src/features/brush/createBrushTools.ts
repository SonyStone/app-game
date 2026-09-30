import { defaultBrush, type Brush } from '@app-game/paint-core/brush';
import type { BrushEngineSelection } from '@app-game/paint-core/composition/defineBrushEngine';
import { createSignal, latest } from 'solid-js';

/**
 * Owns the active tool and the brush settings captured by the next stroke. The round brush and the ABR brush keep
 * separate settings, restored when their tool is chosen again; colors are shared by every tool.
 * Must be created within a Solid owner.
 */
export function createBrushTools() {
  const [brush, setBrush] = createSignal<Brush>({ ...defaultBrush(), backgroundColor: '#ffffff' });
  const [tool, setTool] = createSignal<PaintTool>('brush');
  /** Settings of the tools that are not active; the active tool's settings are `brush`. */
  const profiles = { round: defaultBrush(), abr: defaultBrush() };

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
        setBrush((value) => ({ ...value, tool: 'eraser', engine: undefined }));
      }
    },
    /** Merges changed settings into the active brush. */
    updateBrush(patch: Partial<Brush>) {
      setBrush((value) => ({ ...value, ...patch }));
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
    swapColors() {
      const current = latest(brush);
      setBrush({ ...current, color: current.backgroundColor ?? '#ffffff', backgroundColor: current.color });
    },
    resetColors() {
      setBrush((value) => ({ ...value, color: '#000000', backgroundColor: '#ffffff' }));
    },
    /** Scales the brush size, limited to 1–512 px, or 1–5000 px for ABR presets. */
    scaleSize(factor: number) {
      setBrush((value) => ({
        ...value,
        size: Math.max(1, Math.min(value.engine?.id === 'abr' ? 5000 : 512, value.size * factor))
      }));
    }
  };

  /** Stores the active brush's settings before another tool or preset replaces them. */
  function keepProfile() {
    const current = latest(brush);
    const active = latest(tool);
    if (active === 'brush') {
      profiles.round = current;
    }

    if (active === 'abr-brush') {
      profiles.abr = current;
    }

    return current;
  }
}

/** Canvas tools. `brush` and `eraser` also name the brush's own `tool`; the ABR brush paints with `tool: 'brush'`. */
export type PaintTool = Brush['tool'] | 'abr-brush' | 'lasso';
