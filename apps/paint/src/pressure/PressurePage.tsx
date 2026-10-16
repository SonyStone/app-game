import { createPressureCalibration, PressureCalibration } from '@app-game/pressure-calibration';
import styles from './PressurePage.module.css';

/**
 * Pen pressure calibration on a page of its own, without loading the editor. It keeps the curve where Paint reads it
 * (`localStorage`, same origin), so a curve saved here applies to Paint's strokes on this device too. The test canvas
 * draws with a plain round brush.
 */
export function PressurePage() {
  const calibration = createPressureCalibration();

  return (
    <main class={styles.page}>
      <h1>Pen pressure</h1>
      <p class={styles.lead}>
        Calibrates this device's pen for every brush in Paint.{' '}
        {calibration.calibration() ? 'The pen is calibrated.' : 'The pen is not calibrated yet.'}{' '}
        <a href="./">Open Paint</a>
      </p>
      <PressureCalibration
        saved={calibration.calibration()?.curve}
        onSave={calibration.save}
        onReset={calibration.reset}
      />
    </main>
  );
}
