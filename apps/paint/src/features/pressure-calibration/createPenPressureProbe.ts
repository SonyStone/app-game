import { strokePressures, type PressureStroke } from '@app-game/paint-core/pressureCurve';
import { createPenStrokes } from '@app-game/pressure-calibration';
import { createSignal, onCleanup, type Accessor } from 'solid-js';

/**
 * The pen's raw pressure where a pressure curve is being edited, for every copy of the curve's graph to show: `marker`
 * is the raw pressure of a pen pressing a watched canvas now (`undefined` between strokes), and `measured` the raw
 * pressures of the pen strokes drawn on watched canvases since watching began, for the graph's histogram (ends of
 * finished strokes left out, as calibration leaves them out; see `strokePressures`), with the stroke in progress, so
 * the histogram fills as the pen draws.
 *
 * `watch` follows the pen strokes on the canvases inside `target` while the caller's owner lives, such as a brush
 * studio's drawing pad while the studio is open, where calibration's steps are drawn too; when that owner ends, the
 * marker and the pressures are forgotten, so each visit starts with an empty histogram. Mouse and touch strokes carry
 * no pressure and are not counted.
 */
export function createPenPressureProbe() {
  const [source, setSource] = createSignal<
    { pressure: Accessor<number | undefined>; drawing: Accessor<readonly number[]> } | undefined
  >(undefined, { ownedWrite: true });
  const [drawn, setDrawn] = createSignal<readonly number[]>([], { ownedWrite: true });

  return {
    marker: () => source()?.pressure(),
    measured: (): readonly number[] => {
      const drawing = source()?.drawing() ?? [];
      return drawing.length ? [...drawn(), ...drawing] : drawn();
    },
    watch(target: Accessor<Element | undefined>) {
      let strokes: PressureStroke[] = [];
      const pen = createPenStrokes(target, (stroke) => {
        strokes = [...strokes, stroke];
        setDrawn(strokePressures(strokes));
      });
      setSource({ pressure: pen.pressure, drawing: pen.drawing });
      onCleanup(() => {
        setSource(undefined);
        setDrawn([]);
      });
    }
  };
}
