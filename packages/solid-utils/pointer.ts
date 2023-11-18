import { fromEvent } from 'rxjs';

function pointer(elemenet: HTMLElement) {
  const pointerdown = fromEvent(elemenet, 'pointerdown');
}
