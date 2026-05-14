import { MonoTypeOperatorFunction, Observable, takeUntil } from 'rxjs';
import { onCleanup } from 'solid-js';

export function takeUntilCleanup<T>(): MonoTypeOperatorFunction<T> {
  const destroyed$ = new Observable<void>((observer) => {
    const unregisterFn = onCleanup(() => observer.next.bind(observer));
    return unregisterFn;
  });

  return <T>(source: Observable<T>) => {
    return source.pipe(takeUntil(destroyed$));
  };
}
