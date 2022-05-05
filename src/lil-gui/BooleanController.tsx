import s from './base.module.scss';
import { getNameId } from './name_id';

interface Props {
  value: () => any;
  name: string;
}

export default function BooleanController(props: Partial<Props>) {
  const id = getNameId();
  return (
    <div class={[s.controller, s.boolean].join(' ')}>
      <div class={s.name} id={id}>
        {props.name}
      </div>
      <label class={s.widget}>
        <input type="checkbox" aria-labelledby={id} />
      </label>
    </div>
  );
}
