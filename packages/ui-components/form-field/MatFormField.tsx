import s from './MatFormField.module.css';

export function MatFormField() {

  return (
    <div class={s.main}>
      <div class={s.wrapper}>

        <div class={s.flex}>

          <div class={s.outline}>
            <div class={s.outlineStart}></div>
            <div class={s.outlineGap}></div>
            <div class={s.outlineEnd}></div>
          </div>
          <div class={`${s.outline} ${s.outlineThick}`}>
            <div class={s.outlineStart}></div>
            <div class={s.outlineGap}></div>
            <div class={s.outlineEnd}></div>
          </div>

          <div class={s.infix}>
            <input class={s.input}></input>

            <span class={s.labelWrapper}>
              <label>Outline form field</label>
            </span>
          </div>

        </div>
      </div>
    </div>
  )
}