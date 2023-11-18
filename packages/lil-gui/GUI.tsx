import s from './base.module.scss';
import Hierarchy from './Hierarchy';

export default function GUI(props: any) {
  return (
    <div class={[s.gui, s.autoPlace, s.allowTouchStyles, s.root].join(' ')}>
      <Hierarchy>{props.children}</Hierarchy>
    </div>
  );
}
