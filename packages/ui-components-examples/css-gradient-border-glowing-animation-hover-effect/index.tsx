import { onCleanup, onMount } from 'solid-js';
import s from './style.module.scss';

export default function Example() {
  onMount(() => {
    const cards = document.querySelectorAll('.' + s.card);

    cards.forEach((card) => {
      card.addEventListener('pointermove', handleMouseMove as any);
    });

    function handleMouseMove(this: HTMLDivElement, e: PointerEvent) {
      const rect = this.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - rect.width / 2;
      const mouseY = e.clientY - rect.top - rect.height / 2;

      let angle = Math.atan2(mouseY, mouseX) * (180 / Math.PI);

      angle = (angle + 360) % 360;

      this.style.setProperty('--start', (angle + 60).toString());
    }

    onCleanup(() => {
      cards.forEach((card) => {
        card.removeEventListener('pointermove', handleMouseMove as any);
      });
    });
  });

  return (
    <div class={s.body}>
      <div class={s.card}>
        <div class={s.glow}></div>
        <h1 class={s.h1}>01</h1>
        <p class={s.p}>Move your mouse cursor over the card.</p>
      </div>
      <div class={s.card}>
        <div class={s.glow}></div>
        <h1 class={s.h1}>02</h1>
        <p class={s.p}>Move your mouse cursor over the card.</p>
      </div>
      <div class={s.card}>
        <div class={s.glow}></div>
        <h1 class={s.h1}>03</h1>
        <p class={s.p}>Move your mouse cursor over the card.</p>
      </div>
    </div>
  );
}
