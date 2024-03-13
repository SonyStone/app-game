import { onCleanup, onMount } from 'solid-js';
import { style } from 'solid-js/web';

import s from './RippleItem.module.css';

type ExtPointerEvent = PointerEvent & { currentTarget: HTMLDivElement; target: Element };

interface Props {
  event: ExtPointerEvent;
  onFadeOut: (event: ExtPointerEvent) => void;
}

export function RippleItem({ event, onFadeOut }: Props) {
  const x = event.clientX;
  const y = event.clientY;

  const currentTarget = event.currentTarget;
  const containerRect = currentTarget.getBoundingClientRect();
  const animationConfig = { ...defaultRippleAnimationConfig };

  const radius = distanceToFurthestCorner(x, y, containerRect);
  const offsetX = x - containerRect.left;
  const offsetY = y - containerRect.top;
  const duration = animationConfig.enterDuration;

  const node = (
    <div
      class={s.rippleItem}
      style={{
        left: `${offsetX - radius}px`,
        top: `${offsetY - radius}px`,
        height: `${radius * 2}px`,
        width: `${radius * 2}px`,
        'background-color': '#00ff001a',
        'transition-duration': `${duration}ms`
      }}
    ></div>
  ) as HTMLElement;

  onMount(() => {
    enforceStyleRecalculation(node);
    style(node, {
      transform: 'scale(1)'
    });
  });

  let timeout1: number;
  const fadeOutRipple = () => {
    style(node, {
      'transition-duration': `${animationConfig.exitDuration}ms`,
      opacity: '0'
    });

    timeout1 = setTimeout(() => {
      onFadeOut(event);
    }, animationConfig.exitDuration);
  };

  const timeout2 = setTimeout(() => {
    fadeOutRipple();
  }, duration);

  onCleanup(() => {
    clearTimeout(timeout1);
    clearTimeout(timeout2);
  });

  return node;
}

const defaultRippleAnimationConfig = {
  enterDuration: 225,
  exitDuration: 150
};

function distanceToFurthestCorner(x: number, y: number, rect: ClientRect) {
  const distX = Math.max(Math.abs(x - rect.left), Math.abs(x - rect.right));
  const distY = Math.max(Math.abs(y - rect.top), Math.abs(y - rect.bottom));
  return Math.sqrt(distX * distX + distY * distY);
}

function enforceStyleRecalculation(el: HTMLElement) {
  // Enforce a style recalculation by calling `getComputedStyle` and accessing any property.
  // Calling `getPropertyValue` is important to let optimizers know that this is not a noop.
  // See: https://gist.github.com/paulirish/5d52fb081b3570c81e3a

  window.getComputedStyle(el).getPropertyValue('opacity');
}
