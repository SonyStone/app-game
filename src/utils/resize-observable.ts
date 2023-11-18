import { Observable } from "rxjs";

export function resizeObservable(elem: Element): Observable<ResizeObserverEntry[]> {
  return new Observable((subscriber) => {
    const resizeObserver = new ResizeObserver(entries => {
      subscriber.next(entries);
    });

    resizeObserver.observe(elem);
    return () => {
      resizeObserver.unobserve(elem);
    }
  });
}