import type { PressureCurve } from '@app-game/paint-core/pressureCurve';
import { PressureCurveEditor } from '@app-game/pressure-calibration';
import { SketchIcon } from '../../shared/ui/SketchIcon';
import styles from './PenPressurePane.module.css';

/**
 * The pen's pressure curve as a page of the brush studio, for hosts without a curve control of their own: the graph
 * (`PressureCurveEditor`) over the pressures drawn on the studio's pad, with a dot for the pen pressing it now, and
 * two short buttons, Measure (the three calibration steps) and Reset (the straight line, while the pen is
 * calibrated). Controlled: edits go through `onChange` as the pointer moves.
 */
export function PenPressurePane(props: {
  curve: PressureCurve;
  measured: readonly number[];
  marker: number | undefined;
  /** Whether the pen has a curve of its own; Reset is offered only then. */
  calibrated: boolean;
  onChange: (curve: PressureCurve) => void;
  onMeasure: () => void;
  onReset: () => void;
}) {
  return (
    <div class={styles.pane}>
      <PressureCurveEditor
        class={styles.graph}
        curve={props.curve}
        measured={props.measured}
        marker={props.marker}
        onChange={props.onChange}
      />
      <div class={styles.actions}>
        <button type="button" onClick={() => props.onMeasure()}>
          <SketchIcon name="pressure" size={18} />
          Measure
        </button>
        <button type="button" disabled={!props.calibrated} onClick={() => props.onReset()}>
          <SketchIcon name="reset" size={18} />
          Reset
        </button>
      </div>
    </div>
  );
}

/** The pen pressure entry's status: "Off" while the pen is not calibrated, otherwise how many points its curve has. */
export function penPressureStatus(curve: PressureCurve | undefined) {
  return curve ? `${curve.points.length} points` : 'Off';
}
