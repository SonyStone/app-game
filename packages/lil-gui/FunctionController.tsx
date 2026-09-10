import s from './FunctionController.module.css';

interface Props {
  value: () => any;
  name: string;
}

export default function FunctionController(props: Partial<Props>) {
  return (
    <div class={s.controller}>
      <div class={s.widget}>
        <button onClick={props.value}>
          <div class={s.name}>{props.name}</div>
        </button>
      </div>
    </div>
  );
}
