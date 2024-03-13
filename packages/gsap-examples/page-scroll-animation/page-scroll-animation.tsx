import { Meta, Title } from '@solidjs/meta';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import { onCleanup, onMount } from 'solid-js';

gsap.registerPlugin(ScrollTrigger);

export default function PageScrollAnimation() {
  const boxes = [1, 2, 3].map(
    () =>
      (
        <div class="bg-green h-25 w-25 rounded-2.5 text-2xl leading-25 text-center text-white">box</div>
      ) as HTMLDivElement
  );

  const section = (
    <div class="flex place-content-center place-items-center w-full h-screen flex-col gap-4">{boxes}</div>
  ) as HTMLElement;

  onMount(() => {
    const ctx = gsap.context((self) => {
      boxes.forEach((box) => {
        gsap.to(box, {
          x: 150,
          scrollTrigger: {
            trigger: box,
            start: 'bottom bottom',
            end: 'top 50%',
            scrub: 1
          }
        });
      });
    }, section); // <- Scope!

    const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.4 });
    tl.to(boxes[0], { duration: 1, rotation: 360 })
      .to(boxes[1], { duration: 1, rotation: 360 }, '<+=25%')
      .to(boxes[2], { duration: 1, rotation: 360 }, '<+=25%');

    onCleanup(() => {
      ctx.revert();
    });
  });

  return (
    <>
      <Title>Page Scroll Animation</Title>
      <Meta name="description" content="Page Scroll Animation" />
      <section class="flex place-content-center place-items-center w-full h-screen flex-col gap-4">
        <h1>Gsap goes here</h1>
      </section>
      {section}
      <section class="flex place-content-center place-items-center w-full h-screen flex-col gap-4" />
    </>
  );
}
