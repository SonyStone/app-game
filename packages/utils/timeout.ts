import { onCleanup } from 'solid-js';

/**
 * cleanup a timer when the component is unmounted
 */
export const createTimer = () => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let rejectFn: () => void;

  onCleanup(() => {
    clearTimeout(timeout);
    rejectFn?.();
  });

  return (ms?: number | undefined) =>
    new Promise((resolve, reject) => {
      timeout = setTimeout(resolve, ms);
      rejectFn = reject;
    }).catch(() => {}); // ignore the error
};
