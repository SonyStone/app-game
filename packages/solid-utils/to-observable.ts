import { from, Observable } from 'rxjs';
import { Accessor, observable } from 'solid-js';

export function toObservable<T>(input: Accessor<T>): Observable<T> {
  return from(observable(input));
}
