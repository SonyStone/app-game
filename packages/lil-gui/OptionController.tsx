import { createMemo, createSignal, For } from 'solid-js';
import s from './base.module.scss';
import { getNameId } from './name_id';

interface Props {
  value: () => any;
  setValue: (value: any) => any;
  name: string;
  options: string[] | { [key: string]: any };
}

export default function OptionController(props: Partial<Props>) {
  const id = getNameId();

  const values = createMemo(() => {
    const options = props.options ?? [];

    return Array.isArray(options) ? options : Object.values(options);
  });

  const names = createMemo(() => {
    const options = props.options ?? [];
    return Array.isArray(options) ? options : Object.keys(options);
  });

  const [focus, setFocus] = createSignal(false);

  const select = (
    <select
      aria-labelledby={id}
      class={focus() ? s.focus : ''}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      onChange={() => props.setValue?.(values()[select.selectedIndex])}>
      <For each={names()}>{(name) => <option>{name}</option>}</For>
    </select>
  ) as HTMLSelectElement;

  return (
    <div class={[s.controller, s.string].join(' ')}>
      <div class={s.name} id={id}>
        {props.name}
      </div>
      <div class={s.widget}>
        {select}
        <div class={s.display}></div>
      </div>
    </div>
  );
}
