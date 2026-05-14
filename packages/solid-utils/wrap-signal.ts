import { ObservableInput, distinctUntilChanged, of, switchMap } from 'rxjs';
import { Accessor } from 'solid-js';
import { toObservable } from './toObservable';
import { toSignal } from './toSignal';

export function wrapSignal<R, T>(
  signal: Accessor<T>,
  input: (value: NonNullable<T>, index: number) => ObservableInput<R>,
  initialValue: R
): Accessor<R> {
  return toSignal(
    toObservable(signal).pipe(
      switchMap((value, index) => (value ? input(value, index) : of(initialValue))),
      distinctUntilChanged()
    ),
    initialValue
  );
}
