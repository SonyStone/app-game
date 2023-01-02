import s from "./JoyStick.module.scss";

export default function JoyStick(props: {
  maxRadius: number;
  onMove: any;
  game: any;
}) {
  const domElement = (<div class={s.thumb}></div>) as HTMLElement;
  const maxRadius = props.maxRadius || 40;
  const maxRadiusSquared = maxRadius * maxRadius;
  const onMove = props.onMove;
  const game = props.game;
  const origin = { left: domElement.offsetLeft, top: domElement.offsetTop };

  return <div class={s.circle}>{domElement}</div>;
}
