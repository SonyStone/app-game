export type Signal<T> = () => T;

export type Write<T> = { set(value: T): void };

export type WritableSignal<T> = Signal<T> & Write<T>;

export function signal<T>(initialValue: T): WritableSignal<T> {
  return Object.assign(
    function () {
      return initialValue;
    },
    {
      set(value: T) {
        initialValue = value;
      },
    }
  );
}
