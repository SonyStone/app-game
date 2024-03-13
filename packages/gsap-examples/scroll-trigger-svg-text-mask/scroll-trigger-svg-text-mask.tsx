import { Meta, Title } from '@solidjs/meta';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import { onCleanup, onMount } from 'solid-js';

import cloud1 from './cloud1.png?url';
import cloud1Mask from './cloud1Mask.jpg?url';
import cloud2 from './cloud2.png?url';
import cloud3 from './cloud3.png?url';
import mountBg from './mountBg.png?url';
import mountFg from './mountFg.png?url';
import mountMg from './mountMg.png?url';
import sky from './sky.jpg?url';

gsap.registerPlugin(ScrollTrigger);

export default function ScrollTriggerSVGTextMask() {
  let arrowBtn: SVGRectElement;
  let main: HTMLDivElement;
  let scrollDist: HTMLDivElement;

  const images = [
    { img: sky, height: 590, className: 'sky' },
    { img: mountBg, height: 800, className: 'mountBg' },
    { img: mountMg, height: 800, className: 'mountMg' },
    { img: cloud2, height: 800, className: 'cloud2' },
    { img: mountFg, height: 800, className: 'mountFg' },
    { img: cloud1, height: 800, className: 'cloud1' },
    { img: cloud3, height: 800, className: 'cloud3' }
  ].map(({ img, height, className }) => <image class={className} href={img} width="1200" height={height} />);

  onMount(() => {
    const tween1 = gsap.set(main, {
      position: 'fixed',
      background: '#fff',
      width: '100%',
      // maxWidth: '1200px',
      height: '100%',
      top: 0,
      left: '50%',
      x: '-50%'
    });
    const tween2 = gsap.set(scrollDist, { width: '100%', height: '200%' });

    gsap
      .timeline({ scrollTrigger: { trigger: scrollDist, start: 'top top', end: 'bottom bottom', scrub: 1 } })
      .fromTo('.sky', { y: 0 }, { y: -200 }, 0)
      .fromTo('.cloud1', { y: 100 }, { y: -800 }, 0)
      .fromTo('.cloud2', { y: -150 }, { y: -500 }, 0)
      .fromTo('.cloud3', { y: -50 }, { y: -650 }, 0)
      .fromTo('.mountBg', { y: -10 }, { y: -100 }, 0)
      .fromTo('.mountMg', { y: -30 }, { y: -250 }, 0)
      .fromTo('.mountFg', { y: -50 }, { y: -600 }, 0);

    const mouseenterHandler = (e: MouseEvent) => {
      gsap.to('.arrow', { y: 10, duration: 0.8, ease: 'back.inOut(3)', overwrite: 'auto' });
    };
    const mouseleaveHandler = (e: MouseEvent) => {
      gsap.to('.arrow', { y: 0, duration: 0.5, ease: 'power3.out', overwrite: 'auto' });
    };

    const clickHandler = (e: MouseEvent) => {
      gsap.to(window, { scrollTo: innerHeight, duration: 1.5, ease: 'power1.inOut' });
    };

    arrowBtn.addEventListener('mouseenter', mouseenterHandler);
    arrowBtn.addEventListener('mouseleave', mouseleaveHandler);
    arrowBtn.addEventListener('click', (e) => clickHandler);

    onCleanup(() => {
      tween1.revert();
      tween2.revert();
      arrowBtn.removeEventListener('mouseenter', mouseenterHandler);
      arrowBtn.removeEventListener('mouseleave', mouseleaveHandler);
      arrowBtn.removeEventListener('click', (e) => clickHandler);
    });
  });

  return (
    <>
      <Title>ScrollTrigger: SVG Text Mask</Title>
      <Meta name="description" content="ScrollTrigger: SVG Text Mask" />
      <div ref={(ref) => (scrollDist = ref)}></div>
      <div ref={(ref) => (main = ref)} class="text-7.4rem font-bold ">
        <svg viewBox="0 0 1200 800" xmlns="http://www.w3.org/2000/svg">
          <mask id="m">
            <g class="cloud1">
              <rect fill="#fff" width="100%" height="801" y="799" />
              <image href={cloud1Mask} width="1200" height="800" />
            </g>
          </mask>

          {images}
          <text fill="#fff" x="350" y="200">
            EXPLORE
          </text>
          <polyline
            class="arrow"
            fill="#fff"
            points="599,250 599,289 590,279 590,282 600,292 610,282 610,279 601,289 601,250"
          />

          <g mask="url(#m)">
            <rect fill="#fff" width="100%" height="100%" />
            <text x="350" y="200" fill="#162a43">
              FURTHER
            </text>
          </g>

          <rect
            ref={(ref) => (arrowBtn = ref)}
            width="100"
            height="100"
            opacity="0"
            x="550"
            y="220"
            style="cursor:pointer"
          />
        </svg>
      </div>
    </>
  );
}
