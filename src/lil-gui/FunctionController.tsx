import s from './base.module.scss';

interface Props {
  value: () => any;
  name: string;
}

export default function FunctionController(props: Partial<Props>) {
  return (
    <div class={[s.controller, s.function].join(' ')}>
      <div class={s.widget}>
        <button onClick={props.value}>
          <div class={s.name}>{props.name}</div>
        </button>
      </div>
    </div>
  );
}
