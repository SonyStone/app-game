export interface TypedEventTarget<E> {
  addEventListener(
    type: string,
    listener: ((event: E) => void) | null,
    options?: boolean | AddEventListenerOptions
  ): void;
  removeEventListener(
    type: string,
    listener?: ((event: E) => void) | null,
    options?: boolean | EventListenerOptions
  ): void;
}

/**
 * Wrapper around {@link Event} to add typings to target and currentTarget.
 */
export type EventWith<G extends Event, T extends TypedEventTarget<G>> = G & {
  readonly currentTarget: T;
};
