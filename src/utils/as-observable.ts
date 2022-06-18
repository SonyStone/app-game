import { Observable } from 'rxjs';
import { Accessor, createEffect, onCleanup } from 'solid-js';

export function asObservable<T>(value: Accessor<T>) {
  return new Observable<T>((subscriber) => {
    createEffect(() => {
      const v = value();
      subscriber.next(v);
    });

    onCleanup(() => {
      subscriber.complete();
    });
  });
}
