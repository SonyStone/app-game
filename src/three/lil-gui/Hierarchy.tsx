import s from './base.module.scss';

export default function Hierarchy(props: any) {
  return (
    <>
      <div class={s.title} role="button" aria-expanded="true" tabindex="0">
        Controls
      </div>
      <div class={s.children}>{props.children}</div>
    </>
  );
}
