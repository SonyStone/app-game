import { computePosition, offset, shift } from '@floating-ui/dom';
import { Accessor, merge, onSettled, untrack } from 'solid-js';

/**
 * Binds precision dragging to `element` and returns an explicit disposer.
 *
 * Pressing the trigger opens a ladder of steps around the pointer; moving vertically picks a step and every
 * 10px of horizontal drag outside the ladder adds or subtracts that step.
 */
export function numberPrecisionDragInput(
  element: HTMLElement,
  props: {
    value?: Accessor<number> | number;
    onChange?: (v: number) => void;
    step?: '100' | '10' | '1' | '.1' | '.01' | '.001' | '.0001';
    max?: '100' | '10' | '1' | '.1' | '.01' | '.001' | '.0001';
    min?: '100' | '10' | '1' | '.1' | '.01' | '.001' | '.0001';
    /**
     * Press that starts a drag: `'middle'` (default) is the middle mouse button, `'primary'` is the primary press
     * of any pointer, including pen tips and touch, which have no middle button.
     */
    trigger?: 'middle' | 'primary';
  }
): () => void {
  const elements = ['100', '10', '1', '.1', '.01', '.001', '.0001'].map(
    (v, i) =>
      (
        <div
          data-value={v}
          class="hover:bg-yellow flex h-10 place-content-center place-items-center border-b border-black last:border-b-0"
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
    <div class="absolute top-0 left-0 flex w-10 cursor-e-resize flex-col border border-black bg-white">{elements}</div>
  ) as HTMLElement;

  const showPrecisionMenu = () => {
    if (!testElement.isConnected) document.body.appendChild(testElement);
  };
  const hidePrecisionMenu = () => testElement.remove();

  // Every horizontal move is applied with the step of the row it happened on, so a pointer that leaves the ladder
  // on one row and re-enters on another never rescales ticks already dragged with the previous step.
  let value = 0;
  let prevTicks = 0;
  let prevElement: HTMLElement | undefined;
  const selectRow = (row: HTMLElement | undefined) => {
    if (!row || row === prevElement) {
      return;
    }

    prevElement?.classList.remove('bg-yellow');
    row.classList.add('bg-yellow');
    prevElement = row;
  };
  const rowAt = (x: number, y: number) => elements.find((g) => g === document.elementFromPoint(x, y));

  const pointerdownHandler = (
    e: PointerEvent & {
      currentTarget: HTMLDivElement;
      target: Element;
    }
  ) => {
    const triggered =
      props.trigger === 'primary' ? e.button === 0 : e.pointerType === 'mouse' && e.button === 1;

    if (triggered) {
      value = props.value === undefined ? 0 : typeof props.value === 'number' ? props.value : untrack(props.value);
      prevTicks = 0;
      e.preventDefault();
      e.stopPropagation();
      element.setPointerCapture(e.pointerId);
      element.addEventListener('pointermove', pointermoveHandler as EventListener);
      element.addEventListener('pointerup', pointerupHandler as EventListener);
      element.addEventListener('pointercancel', pointerupHandler as EventListener);
      element.removeEventListener('pointerdown', pointerdownHandler as EventListener);

      // `offsetX` is relative to the hit child, such as an icon inside a button, so measure from `element` instead.
      const pointerX = e.clientX - element.getBoundingClientRect().left;
      showPrecisionMenu();
      computePosition(element, testElement, {
        placement: 'top-end',
        middleware: [
          offset(({ rects }) => ({
            mainAxis:
              -rects.floating.height / 2 -
              rects.reference.height / 2 +
              (props.step ? (elementsPos[props.step] ?? 0) : 0),
            alignmentAxis: rects.reference.width - pointerX - rects.floating.width / 2
          })),
          shift({
            mainAxis: true,
            crossAxis: true
          })
        ]
      }).then((pos) => {
        testElement.style.left = pos.x + 'px';
        testElement.style.top = pos.y + 'px';
        if (testElement.isConnected) {
          selectRow(rowAt(e.clientX, e.clientY));
        }
      });
    }
  };

  const pointermoveHandler = (
    e: PointerEvent & {
      currentTarget: HTMLDivElement;
      target: Element;
    }
  ) => {
    let ticks = 0;
    {
      const rect = testElement.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const x2 = e.clientX - rect.right;
      if (x2 > 0) {
        ticks = Math.ceil(x2 / 10);
      } else if (x < 0) {
        ticks = Math.ceil(x / 10);
      } else {
        ticks = 0;
      }
    }

    if (prevElement && ticks !== prevTicks) {
      value = +(value + (ticks - prevTicks) * stepOf(prevElement)).toFixed(5);
      prevTicks = ticks;
      props.onChange?.(value);
    }

    selectRow(rowAt(e.clientX, e.clientY));
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
    element.removeEventListener('pointercancel', pointerupHandler as EventListener);
    prevElement = undefined;

    hidePrecisionMenu();
    element.addEventListener('pointerdown', pointerdownHandler as EventListener);
  };

  element.addEventListener('pointerdown', pointerdownHandler as EventListener);

  return () => {
    hidePrecisionMenu();
    element.removeEventListener('pointerdown', pointerdownHandler as EventListener);
    element.removeEventListener('pointermove', pointermoveHandler as EventListener);
    element.removeEventListener('pointerup', pointerupHandler as EventListener);
    element.removeEventListener('pointercancel', pointerupHandler as EventListener);
  };
}

/**
 * Drag handle for pens and touch: a primary press on the button runs the same precision drag as a middle-button
 * press on an input. Place it next to the input it edits; the binding is released when the button unmounts.
 */
export function NumberPrecisionDragButton(
  props: Omit<Parameters<typeof numberPrecisionDragInput>[1], 'trigger'> & { class?: string }
) {
  let button!: HTMLButtonElement;

  onSettled(() => numberPrecisionDragInput(button, merge(props, { trigger: 'primary' as const })));

  return (
    <button
      ref={(element) => (button = element)}
      type="button"
      aria-label="Drag to change value"
      class={[
        'flex size-6 shrink-0 cursor-ew-resize touch-none place-content-center place-items-center rounded border select-none',
        props.class
      ]}
    >
      ↔
    </button>
  );
}

/** Reads the step a precision-menu row applies per 10px of horizontal drag. */
function stepOf(row: HTMLElement): number {
  return parseFloat(row.dataset.value ?? '1');
}
