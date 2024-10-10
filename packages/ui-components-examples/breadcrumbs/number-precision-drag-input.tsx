import { computePosition, offset, shift } from '@floating-ui/dom';
import { Accessor, createEffect, createSignal, onCleanup, untrack } from 'solid-js';

export function numberPrecisionDragInput(
  element: HTMLElement,
  props: {
    value?: Accessor<number> | number;
    onChange?: (v: number) => void;
    step?: '100' | '10' | '1' | '.1' | '.01' | '.001' | '.0001';
    max?: '100' | '10' | '1' | '.1' | '.01' | '.001' | '.0001';
    min?: '100' | '10' | '1' | '.1' | '.01' | '.001' | '.0001';
  }
) {
  const elements = ['100', '10', '1', '.1', '.01', '.001', '.0001'].map(
    (v, i) =>
      (
        <div
          data-value={v}
          class="hover:bg-yellow flex h-10 place-content-center place-items-center  border-b border-black last:border-b-0"
        >
          {v}
        </div>
      ) as HTMLElement
  );
  const elementsPos = {
    '100': -120,
    '10': -80,
    '1': -40,
    '.1': 0,
    '.01': +40,
    '.001': +80,
    '.0001': +120
  };

  const testElement = (
    <div class="absolute left-0 top-0 flex w-10 cursor-e-resize flex-col border border-black bg-white">{elements}</div>
  ) as HTMLElement;

  const [show, setShow] = createSignal(false);

  createEffect((prev) => {
    const next = show();
    if (next) {
      document.body.appendChild(testElement);
    } else if (prev === true) {
      document.body.removeChild(testElement);
    }
    return next;
  }, undefined);

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
      value = props.value ? (typeof props.value === 'number' ? props.value : untrack(props.value)) : 0;
      e.preventDefault();
      e.stopPropagation();
      element.setPointerCapture(e.pointerId);
      element.addEventListener('pointermove', pointermoveHandler as EventListener);
      element.addEventListener('pointerup', pointerupHandler as EventListener);
      element.removeEventListener('pointerdown', pointerdownHandler as EventListener);

      setShow(true);
      computePosition(element, testElement, {
        placement: 'top-end',
        middleware: [
          offset(({ rects }) => ({
            mainAxis: -rects.floating.height / 2 - rects.reference.height / 2 + (elementsPos[props.step] ?? 0),
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
    element.removeEventListener('pointerup', pointerupHandler as EventListener);
    prevElement = undefined;
    value = 0;

    setShow(false);
    element.addEventListener('pointerdown', pointerdownHandler as EventListener);
  };

  element.addEventListener('pointerdown', pointerdownHandler as EventListener);

  onCleanup(() => {
    setShow(false);
    element.removeEventListener('pointerdown', pointerdownHandler as EventListener);
  });
}
