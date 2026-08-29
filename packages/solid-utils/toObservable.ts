import { Observable } from 'rxjs';
import { type Accessor, createRoot, createTrackedEffect } from 'solid-js';

export function toObservable<T>(input: Accessor<T>): Observable<T> {
  return new Observable<T>((subscriber) =>
    createRoot((dispose) => {
      createTrackedEffect(() => {
        subscriber.next(input());
      });
      return dispose;
    })
  );
}
