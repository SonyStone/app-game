import { Subscription } from 'rxjs';
import { onCleanup } from 'solid-js';

/**
 * creates Subscription with automatic unsubscribe
 */
export function createSubscription() {
  const subscription = new Subscription();

  onCleanup(() => subscription.unsubscribe());

  return subscription;
}
