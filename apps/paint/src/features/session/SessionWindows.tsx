import { ok } from 'neverthrow';
import { Show, untrack } from 'solid-js';
import { FloatingWindow } from '../../shared/ui/FloatingWindow';
import { FreshTabControls } from '../fresh-tab';
import { LocalUndoWindow } from '../local-undo';
import { MixingPaletteWindow } from '../mixing-palette';
import { PalmRejectionControls } from '../palm-rejection';
import { PressureCalibrationControls, PressureCalibrationWindow } from '../pressure-calibration';
import type { PaintSession } from './createPaintSession';

/**
 * The session's floating windows that are open, over the variant's UI: `PaintEditor` shows them in every variant, so
 * a variant only opens them (see `PaintSession.windows`). The mixing palette loads the brush with paint mixed from
 * tubes; the Pen window holds palm rejection, what to do when Chrome loses the pen hover (not in the Android shell,
 * which supplies it) and the way to the pen
 * pressure calibration, whose window draws with the current brush; the Local undo window holds that tool's settings,
 * Apply and Cancel, and shows only while the tool is active.
 */
export function SessionWindows(props: { session: PaintSession }) {
  const {
    windows,
    palmSettings,
    penHover,
    freshTab,
    nativeShell,
    brush,
    loadColor,
    recentColors,
    pressureCalibration,
    tools,
    library,
    localUndo,
    tool
  } = untrack(() => props.session);

  return (
    <>
      <Show when={windows.isOpen('palette')}>
        <MixingPaletteWindow
          position={windows.position('palette')}
          onMove={(position, done) => windows.move('palette', position, done)}
          onClose={() => windows.close('palette')}
          color={brush().color}
          onLoad={loadColor}
          recentColors={recentColors}
        />
      </Show>
      <Show when={windows.isOpen('pen')}>
        <FloatingWindow
          title="Pen"
          width={320}
          position={windows.position('pen')}
          onMove={(position, done) => windows.move('pen', position, done)}
          onClose={() => windows.close('pen')}
        >
          <PalmRejectionControls
            settings={palmSettings.settings()}
            penHovers={penHover.hovers()}
            onChange={palmSettings.update}
          />
          <Show when={!nativeShell.active}>
            <FreshTabControls auto={freshTab.auto()} onChange={freshTab.setAuto} />
          </Show>
          <PressureCalibrationControls
            calibrated={!!pressureCalibration.calibration()}
            onOpen={() => windows.open('pressure')}
          />
        </FloatingWindow>
      </Show>
      <Show when={windows.isOpen('pressure')}>
        <PressureCalibrationWindow
          position={windows.position('pressure')}
          onMove={(position, done) => windows.move('pressure', position, done)}
          onClose={() => windows.close('pressure')}
          calibration={pressureCalibration}
          brush={brush()}
          preset={tools.preset()}
          resources={async (id) => {
            const preset = id === undefined ? undefined : library.find(id);
            return preset ? library.resources(preset) : ok([]);
          }}
        />
      </Show>
      <Show when={windows.isOpen('local-undo') && tool() === 'local-undo'}>
        <LocalUndoWindow
          localUndo={localUndo}
          position={windows.position('local-undo')}
          onMove={(position, done) => windows.move('local-undo', position, done)}
          onClose={() => windows.close('local-undo')}
        />
      </Show>
    </>
  );
}
