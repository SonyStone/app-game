export function fadeOut(elm: Element): Animation {
  return elm.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: 1000,
    easing: 'ease-out',
    iterations: 1,
    fill: 'forwards'
  });
}
