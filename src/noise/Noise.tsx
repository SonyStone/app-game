import s from './Noise.module.scss';
import noise from './noise.png';

export default function Noise() {
  return (
    <div
      class={s.noise}
      style={{
        'background-image': `url(${noise})`,
      }}></div>
  );
}
