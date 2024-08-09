import { createTimer } from '@packages/utils/timeout';
import pointerEventsData from './pointer-events-data.json?url';

/**
 * drow test stroke
 */
export const createPointerEvents = () => {
  const timeout = createTimer();

  return {
    apply: async (element: Element) => {
      const data = (await import(pointerEventsData)).default;
      for (const dataEvent of data) {
        timeout(dataEvent.timeStamp - data[0].timeStamp).then(() => {
          // console.log(`dataEvent`, dataEvent.type, dataEvent.clientX, dataEvent.clientY);
          const event = new PointerEvent(dataEvent.type, {
            button: dataEvent.button,
            buttons: dataEvent.buttons,
            clientX: dataEvent.clientX,
            clientY: dataEvent.clientY,
            pressure: dataEvent.pressure
          });
          element.dispatchEvent(event);
        });
      }
    }
  };
};
