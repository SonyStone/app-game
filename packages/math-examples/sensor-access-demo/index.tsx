import { createEventListener } from '@solid-primitives/event-listener';
import { createStore } from 'solid-js/store';

export default function SensorAccessDemo() {
  const [state, setState] = createStore({
    orientation: { alpha: 0, beta: 0, gamma: 0 },
    accelerationIncludingGravity: { x: 0, y: 0, z: 0 },
    acceleration: { x: 0, y: 0, z: 0 },
    rotationRate: { alpha: 0, beta: 0, gamma: 0 },
    interval: 0
  });

  console.log('Sensor Access Demo - see console for output');

  createEventListener(window, 'devicemotion', (event) => {
    console.log('Device Motion Event:', event);
    {
      const { x, y, z } = event.accelerationIncludingGravity ?? { x: 0, y: 0, z: 0 };
      setState('accelerationIncludingGravity', { x: x ?? 0, y: y ?? 0, z: z ?? 0 });
    }
    {
      const { x, y, z } = event.acceleration ?? { x: 0, y: 0, z: 0 };
      setState('acceleration', { x: x ?? 0, y: y ?? 0, z: z ?? 0 });
    }
    {
      const { alpha, beta, gamma } = event.rotationRate ?? { alpha: 0, beta: 0, gamma: 0 };
      setState('rotationRate', { alpha: alpha ?? 0, beta: beta ?? 0, gamma: gamma ?? 0 });
    }
    setState('interval', event.interval);
  });

  createEventListener(window, 'deviceorientation', (event) => {
    const { alpha, beta, gamma } = event ?? { alpha: 0, beta: 0, gamma: 0 };
    setState('orientation', { alpha: alpha ?? 0, beta: beta ?? 0, gamma: gamma ?? 0 });
  });

  createEventListener(window, 'deviceorientation', (event) => {
    console.log('Device Orientation Event:', event);
  });

  return (
    <>
      <div>Sensor Access Demo - see console for output</div>
      <h4 style="margin-top:0.75rem;">Orientation</h4>
      <ul>
        <li>
          X-axis (&beta;): <span id="Orientation_b">{state.orientation.beta.toFixed(2)}</span>
          <span>&deg;</span>
        </li>
        <li>
          Y-axis (&gamma;): <span id="Orientation_g">{state.orientation.gamma.toFixed(2)}</span>
          <span>&deg;</span>
        </li>
        <li>
          Z-axis (&alpha;): <span id="Orientation_a">{state.orientation.alpha.toFixed(2)}</span>
          <span>&deg;</span>
        </li>
      </ul>

      <h4>Accelerometer</h4>
      <ul>
        <li>
          X-axis: <span id="Accelerometer_x">{state.acceleration.x.toFixed(2)}</span>
          <span>
            {' '}
            m/s<sup>2</sup>
          </span>
        </li>
        <li>
          Y-axis: <span id="Accelerometer_y">{state.acceleration.y.toFixed(2)}</span>
          <span>
            {' '}
            m/s<sup>2</sup>
          </span>
        </li>
        <li>
          Z-axis: <span id="Accelerometer_z">{state.acceleration.z.toFixed(2)}</span>
          <span>
            {' '}
            m/s<sup>2</sup>
          </span>
        </li>
        <li>
          Data Interval: <span id="Accelerometer_i">{state.interval.toFixed(2)}</span>
          <span> ms</span>
        </li>
      </ul>

      <h4>Accelerometer including gravity</h4>

      <ul>
        <li>
          X-axis: <span id="Accelerometer_gx">{state.accelerationIncludingGravity.x.toFixed(2)}</span>
          <span>
            {' '}
            m/s<sup>2</sup>
          </span>
        </li>
        <li>
          Y-axis: <span id="Accelerometer_gy">{state.accelerationIncludingGravity.y.toFixed(2)}</span>
          <span>
            {' '}
            m/s<sup>2</sup>
          </span>
        </li>
        <li>
          Z-axis: <span id="Accelerometer_gz">{state.accelerationIncludingGravity.z.toFixed(2)}</span>
          <span>
            {' '}
            m/s<sup>2</sup>
          </span>
        </li>
      </ul>

      <h4>Gyroscope</h4>
      <ul>
        <li>
          X-axis: <span id="Gyroscope_x">{state.rotationRate.alpha.toFixed(2)}</span>
          <span>&deg;/s</span>
        </li>
        <li>
          Y-axis: <span id="Gyroscope_y">{state.rotationRate.beta.toFixed(2)}</span>
          <span>&deg;/s</span>
        </li>
        <li>
          Z-axis: <span id="Gyroscope_z">{state.rotationRate.gamma.toFixed(2)}</span>
          <span>&deg;/s</span>
        </li>
      </ul>
    </>
  );
}
