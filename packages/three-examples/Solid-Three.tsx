import { Renderer } from './renderer';
import s from './Solid-Three.module.css';
import TestScene from './Test-Scene';

export default function SolidThree() {
  console.log(`SolidThree created!`);

  return (
    <Renderer class={s.canvas}>
      <TestScene></TestScene>
    </Renderer>
  );
}
