import { Show, untrack } from 'solid-js';
import { FloatingWindow } from '../../shared/ui/FloatingWindow';
import { FreshTabControls } from '../fresh-tab';
import { MixingPaletteWindow } from '../mixing-palette';
import { PalmRejectionControls } from '../palm-rejection';
import type { PaintSession } from './createPaintSession';

/**
 * The session's floating windows that are open, over the variant's UI: `PaintEditor` shows them in every variant, so
 * a variant only opens them (see `PaintSession.windows`). The mixing palette loads the brush with paint mixed from
 * tubes; the Pen window holds palm rejection and what to do when Chrome loses the pen hover.
 */
export function SessionWindows(props: { session: PaintSession }) {
  const { windows, palmSettings, penHover, freshTab, brush, loadColor } = untrack(() => props.session);

  return (
    <>
      <Show when={windows.isOpen('palette')}>
        <MixingPaletteWindow
          position={windows.position('palette')}
          onMove={(position, done) => windows.move('palette', position, done)}
          onClose={() => windows.close('palette')}
          color={brush().color}
          onLoad={loadColor}
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
          <FreshTabControls auto={freshTab.auto()} onChange={freshTab.setAuto} />
        </FloatingWindow>
      </Show>
    </>
  );
}
