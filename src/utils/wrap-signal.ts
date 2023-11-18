import { ObservableInput, distinctUntilChanged, of, switchMap } from 'rxjs';
import { Accessor } from 'solid-js';
import { toObservable } from './to-observable';
import { toSignal } from './to-signal';

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
