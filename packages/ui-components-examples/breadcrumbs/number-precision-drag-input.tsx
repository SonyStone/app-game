import { computePosition, offset, shift } from '@floating-ui/dom';
import { onCleanup } from 'solid-js';

export function numberPrecisionDragInput(
  element: HTMLElement,
  props: { value?: () => number; onChange?: (v: number) => void }
) {
  const elements = ['100', '10', '1', '.1', '.01', '.001', '.0001'].map(
    (v, i) =>
      (
        <div
          data-value={v}
          class="border-b last:border-b-0 flex place-content-center place-items-center  h-10 border-black hover:bg-yellow"
        >
          {v}
        </div>
      ) as HTMLElement
  );

  const testElement = (
    <div class="flex flex-col border bg-white absolute top-0 left-0 border-black w-10 cursor-e-resize">{elements}</div>
  ) as HTMLElement;

  let prevNumber = 0;
  let prevElement: HTMLElement | undefined;
  let value = 0;
  const pointerdownHandler = (
    e: PointerEvent & {
      currentTarget: HTMLDivElement;
      target: Element;
    }
  ) => {
    if (e.pointerType === 'mouse' && e.button === 1) {
      value = props.value?.() ?? 0;
      e.preventDefault();
      e.stopPropagation();
      element.setPointerCapture(e.pointerId);
      element.addEventListener('pointermove', pointermoveHandler as EventListener);
      element.addEventListener('pointerup', pointerupHandler as EventListener);
      element.removeEventListener('pointerdown', pointerdownHandler as EventListener);

      document.body.appendChild(testElement);
      computePosition(element, testElement, {
        placement: 'top-end',
        middleware: [
          offset(({ rects }) => ({
            mainAxis: -rects.floating.height / 2 - rects.reference.height / 2,
            alignmentAxis: rects.reference.width - e.offsetX - rects.floating.width / 2
          })),
          shift({
            mainAxis: true,
            crossAxis: true
          })
        ]
      }).then((pos) => {
        testElement.style.left = pos.x + 'px';
        testElement.style.top = pos.y + 'px';
      });
    }
  };

  const pointermoveHandler = (
    e: PointerEvent & {
      currentTarget: HTMLDivElement;
      target: Element;
    }
  ) => {
    let number = 0;
    {
      const rect = testElement.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const x2 = e.clientX - rect.right;
      if (x2 > 0) {
        number = Math.ceil(x2 / 10);
      } else if (x < 0) {
        number = Math.ceil(x / 10);
      } else {
        number = 0;
      }
    }

    const element = elements.find((g) => g === document.elementFromPoint(e.clientX, e.clientY));

    if (prevElement && element) {
      prevElement.classList.remove('bg-yellow');
    }
    if (element) {
      element.classList.add('bg-yellow');
      prevElement = element;
    }

    if (prevNumber === number) {
      return;
    }

    if (prevElement) {
      const a = parseFloat(prevElement?.dataset.value ?? '1');

      prevNumber = number;
      props.onChange?.(+(value + number * a).toFixed(5));
    }
  };

  const pointerupHandler = (
    e: PointerEvent & {
      currentTarget: HTMLDivElement;
      target: Element;
    }
  ) => {
    prevElement?.classList.remove('bg-yellow');
    element.releasePointerCapture(e.pointerId);
    element.removeEventListener('pointermove', pointermoveHandler as EventListener);
    element.removeEventListener('pointermove', pointerupHandler as EventListener);
    prevElement = undefined;
    value = 0;

    document.body.removeChild(testElement);
    element.addEventListener('pointerdown', pointerdownHandler as EventListener);
  };

  element.addEventListener('pointerdown', pointerdownHandler as EventListener);

  onCleanup(() => {
    element.removeEventListener('pointerdown', pointerdownHandler as EventListener);
  });
}
