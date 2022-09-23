import { Renderer } from './renderer';
import s from './SvgLoader.module.scss';
import TestScene from './Test-Scene';

export default function SolidThree() {
  console.log(`SolidThree created!`);

  return (
    <Renderer class={s.canvas}>
      <TestScene></TestScene>
    </Renderer>
  );
}
