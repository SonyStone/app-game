import { strokePressures, type PressureStroke } from '@app-game/paint-core/pressureCurve';
import { createPenStrokes } from '@app-game/pressure-calibration';
import { createSignal, onCleanup, type Accessor } from 'solid-js';

/**
 * The pen's raw pressure where a pressure curve is being edited, for every copy of the curve's graph to show: `marker`
 * is the raw pressure of a pen pressing a watched canvas now (`undefined` between strokes), and `measured` the raw
 * pressures of the pen strokes drawn on watched canvases since watching began, for the graph's histogram (stroke ends
 * left out, as calibration leaves them out; see `strokePressures`).
 *
 * `watch` follows the pen strokes on the canvases inside `target` while the caller's owner lives, such as a brush
 * studio's drawing pad while the studio is open; when that owner ends, the marker and the pressures are forgotten, so
 * each visit starts with an empty histogram. `add` adds pressures measured elsewhere, as by a calibration's steps.
 * Mouse and touch strokes carry no pressure and are not counted.
 */
export function createPenPressureProbe() {
  const [source, setSource] = createSignal<{ pressure: Accessor<number | undefined> } | undefined>(undefined, {
    ownedWrite: true
  });
  const [drawn, setDrawn] = createSignal<readonly number[]>([], { ownedWrite: true });
  const [added, setAdded] = createSignal<readonly number[]>([], { ownedWrite: true });

  return {
    marker: () => source()?.pressure(),
    measured: (): readonly number[] => (added().length ? [...drawn(), ...added()] : drawn()),
    watch(target: Accessor<Element | undefined>) {
      let strokes: PressureStroke[] = [];
      const pen = createPenStrokes(target, (stroke) => {
        strokes = [...strokes, stroke];
        setDrawn(strokePressures(strokes));
      });
      setSource({ pressure: pen.pressure });
      onCleanup(() => {
        setSource(undefined);
        setDrawn([]);
        setAdded([]);
      });
    },
    add(pressures: readonly number[]) {
      setAdded((current) => [...current, ...pressures]);
    }
  };
}
