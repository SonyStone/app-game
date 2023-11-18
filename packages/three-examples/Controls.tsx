import s from './Controls.module.scss';

export default function Controls() {
  return (
    <div class={s.container}>
      <button class={s.button}>three</button>
      <button class={s.button}>two</button>
    </div>
  );
}
