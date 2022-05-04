import s from './base.module.scss';
import { getNameId } from './name_id';

interface Props {
  value: () => any;
  name: string;
}

export default function StringController(props: Partial<Props>) {
  const id = getNameId();
  return (
    <div class={[s.controller, s.string].join(' ')}>
      <div class={s.name} id={id}>
        {props.name}
      </div>
      <div class={s.widget}>
        <input type="text" aria-labelledby={id} />
      </div>
    </div>
  );
}
