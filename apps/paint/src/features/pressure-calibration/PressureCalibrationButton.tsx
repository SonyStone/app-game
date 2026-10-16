/** Drawing menu entry that opens the pen pressure calibration and tells whether this device has one. */
export function PressureCalibrationButton(props: { calibrated: boolean; onOpen: () => void }) {
  return (
    <button onClick={() => props.onOpen()}>
      Calibrate pen pressure…<span>{props.calibrated ? 'Calibrated' : 'Not calibrated'}</span>
    </button>
  );
}
