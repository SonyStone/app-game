import s from './Animations.module.scss';

export function Box(props: { time: number; width: number }) {
  return (
    <div
      class={[s.box, s.orange].join(' ')}
      style={{
        transform: `translate(${props.time * props.width}vw, 0px)`,
      }}></div>
  );
}

export function Slider(props: { time: number; width: number }) {
  return (
    <input
      style={{ width: `${props.width}vw` }}
      type="range"
      value={props.time}
      disabled
      min={0}
      max={1}
      step={0.0001}
    />
  );
}
