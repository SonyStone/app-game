import { isClient } from '@solid-primitives/utils';
import { onCleanup } from 'solid-js';

type MinimumPointerEventTarget = Pick<
  HTMLElement,
  'setPointerCapture' | 'releasePointerCapture' | 'addEventListener' | 'removeEventListener'
>;

export function createCapture(props: {
  onPointerMove: (ev: PointerEvent) => void;
  onPointerUp: (ev: PointerEvent) => void;
  onPointerCancel: (ev: PointerEvent) => void;
  onLostCapture: (ev: PointerEvent) => void;
}): {
  /** Capture the pointer for reliable tracking */
  set: (element: MinimumPointerEventTarget, pointerId: number) => void;
  /** Release pointer capture and clean up listeners */
  release: VoidFunction;
  /**
   * Transfer pointer capture from the source element to the proxy.
   *
   * Steps:
   * 1. Remove all listeners from the source element
   * 2. Release capture on the source (safe — no lostpointercapture listener)
   * 3. Set capture on the proxy element
   * 4. Bind listeners to the proxy
   * 5. Update internal state to point at the proxy
   */
  transferToProxy: VoidFunction;
} {
  const { getOrCreateProxy } = createProxyElement();

  let capturedElement: MinimumPointerEventTarget | null = null;
  let capturedPointerId: number | null = null;

  function attachListeners(element: MinimumPointerEventTarget): void {
    element.addEventListener('pointermove', props.onPointerMove);
    element.addEventListener('pointerup', props.onPointerUp);
    element.addEventListener('pointercancel', props.onPointerCancel);
    element.addEventListener('lostpointercapture', props.onLostCapture);
  }

  function cleanupListeners(): void {
    if (!capturedElement) {
      return;
    }

    capturedElement.removeEventListener('pointermove', props.onPointerMove);
    capturedElement.removeEventListener('pointerup', props.onPointerUp);
    capturedElement.removeEventListener('pointercancel', props.onPointerCancel);
    capturedElement.removeEventListener('lostpointercapture', props.onLostCapture);
  }

  function set(element: MinimumPointerEventTarget, pointerId: number): void {
    if (capturedElement) {
      release();
    }

    element.setPointerCapture(pointerId);
    capturedElement = element;
    capturedPointerId = pointerId;
    attachListeners(element);
  }

  function release(): void {
    cleanupListeners();

    // Don't call releaseCapture if we already lost it.
    if (capturedElement && capturedPointerId !== null) {
      try {
        capturedElement.releasePointerCapture(capturedPointerId);
      } catch {
        // Already released — ignore
      }
    }
    capturedElement = null;
    capturedPointerId = null;
  }

  function transferToProxy(): void {
    if (!capturedElement || capturedPointerId === null) {
      return;
    }

    // Remove listeners from source — must happen BEFORE releasing capture
    // so the lostpointercapture event (fired by releasePointerCapture)
    // doesn't trigger our onLostCapture handler.
    cleanupListeners();

    // Release capture on the source element
    try {
      capturedElement.releasePointerCapture(capturedPointerId);
    } catch {
      // Already released — ignore
    }

    // Set capture on the proxy
    const proxy = getOrCreateProxy();
    proxy.setPointerCapture(capturedPointerId);

    // Bind listeners to the proxy
    attachListeners(proxy);

    // Update internal state
    capturedElement = proxy;
  }

  return {
    set,
    release,
    transferToProxy
  };
}

function createProxyElement() {
  let proxyElement: HTMLElement | null = null;

  /**
   * Lazily creates a hidden proxy element for pointer capture.
   * The proxy is a zero-size, invisible div appended to document.body.
   * It persists for the lifetime of the sensor and is cleaned up on disposal.
   */
  function getOrCreateProxy(): HTMLElement {
    if (!isClient) {
      throw new Error('createCapture proxy element requires a client environment.');
    }

    if (!proxyElement) {
      proxyElement = getProxyElement();
    }

    return proxyElement;
  }

  onCleanup(() => {
    if (proxyElement) {
      proxyElement.remove();
      proxyElement = null;
    }
  });

  return { getOrCreateProxy };
}

function getProxyElement(): HTMLElement {
  const proxyElement = (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: 0,
        height: 0,
        opacity: 0,
        overflow: 'hidden',
        'pointer-events': 'none'
      }}
      data-dnd-capture-proxy
    />
  ) as HTMLElement;
  document.body.appendChild(proxyElement);

  return proxyElement;
}
