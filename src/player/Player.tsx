import { JSX } from 'solid-js/jsx-runtime';

import s from './Player.module.scss';

interface Props extends JSX.HTMLAttributes<HTMLDivElement> {}

export default function Player(props: Props): JSX.Element {
  console.log(`Props`, props);

  return (
    <div class={s.column_container} {...props}>
      <div class={s.wrapper}>{props.children}</div>
    </div>
  );
}
