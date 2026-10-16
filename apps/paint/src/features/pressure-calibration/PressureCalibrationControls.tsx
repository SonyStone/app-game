import styles from './PressureCalibrationControls.module.css';

/** The Pen window's way to the pen pressure calibration, telling whether this device has one. */
export function PressureCalibrationControls(props: { calibrated: boolean; onOpen: () => void }) {
  return (
    <fieldset class={styles.controls}>
      <legend>Pressure</legend>
      <div class={styles.row}>
        <span>{props.calibrated ? 'Calibrated on this device' : 'Not calibrated'}</span>
        <button onClick={() => props.onOpen()}>Calibrate…</button>
      </div>
    </fieldset>
  );
}
