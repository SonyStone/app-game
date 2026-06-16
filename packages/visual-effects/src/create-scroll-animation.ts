import { onMount, onCleanup, type Accessor } from 'solid-js';

export interface ScrollAnimationOptions {
  threshold?: number;
  rootMargin?: string;
  once?: boolean;
}

export function createScrollAnimation(
  elementRef: Accessor<HTMLElement | undefined>,
  options: ScrollAnimationOptions = {},
) {
  const {
    threshold = 0.1,
    rootMargin = '0px 0px -50px 0px',
    once = true,
  } = options;

  onMount(() => {
    const element = elementRef();
    if (!element || typeof IntersectionObserver === 'undefined') {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const targets = entry.target.querySelectorAll('[data-animate]');
            targets.forEach((target) => target.classList.add('animate-in'));

            if (once) {
              observer.unobserve(entry.target);
            }

            return;
          }

          if (!once) {
            const targets = entry.target.querySelectorAll('[data-animate]');
            targets.forEach((target) => target.classList.remove('animate-in'));
          }
        });
      },
      { threshold, rootMargin },
    );

    observer.observe(element);

    onCleanup(() => {
      observer.disconnect();
    });
  });
}