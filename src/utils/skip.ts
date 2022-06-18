import { filter, tap } from 'rxjs';

/**
 * Helper function to skip events on read and write
 */
export function skip() {
  let skip = false;

  return {
    /** set skip */
    set<T>() {
      return tap<T>(() => {
        skip = true;
      });
    },
    /** check and skip ones */
    check<T>() {
      return filter<T>(() => {
        if (skip) {
          skip = false;
          return false;
        }
        return true;
      });
    },
  };
}
