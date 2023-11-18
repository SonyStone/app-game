import { Subscription } from 'rxjs';
import { onCleanup } from 'solid-js';

/**
 * creates Subscription with automatic unsubscribe
 */
export function createSubscription(
  subscription: Subscription = new Subscription()
) {
  onCleanup(() => subscription.unsubscribe());

  return subscription;
}
