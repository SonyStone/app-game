import { render } from '@solidjs/web';
import { createRoot, flush } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { createScreenRoute } from '../src/createScreenRoute';

const disposers: (() => void)[] = [];
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  document.body.replaceChildren();
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
  delete (document as Partial<Document>).startViewTransition;
});

describe('fullscreen route', () => {
  it('keeps the same deck and local content state through links and browser navigation', () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const host = document.createElement('div');
    document.body.append(host);
    disposers.push(render(() => <App />, host));
    flush();
    const screen = host.querySelector('.workspace');
    const panel = host.querySelector('#panel-music');
    host.querySelector<HTMLButtonElement>('[aria-label="Add an idea to Music"]')!.click();
    flush();
    expect(panel!.querySelector('.file-count')!.textContent).toContain('285');
    host.querySelector<HTMLAnchorElement>('.screen-route-control')!.click();
    flush();
    expect(location.pathname).toBe('/fullscreen');
    expect(host.querySelector('.app')!.classList.contains('is-fullscreen')).toBe(true);
    expect(host.querySelector('.workspace')).toBe(screen);
    expect(host.querySelector('#panel-music')).toBe(panel);
    expect(panel!.querySelector('.file-count')!.textContent).toContain('285');
    window.history.replaceState(null, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
    flush();
    expect(host.querySelector('.app')!.classList.contains('is-preview')).toBe(true);
    expect(host.querySelector('#panel-music')).toBe(panel);
  });

  it('keeps native route motion enabled when the system requests reduced motion', () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: () => true
    }));
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const transition = vi.fn((update: () => void) => {
      update();
      return { skipTransition: vi.fn(), finished: Promise.resolve() };
    });
    Object.defineProperty(document, 'startViewTransition', { configurable: true, value: transition });
    try {
      const host = document.createElement('div');
      document.body.append(host);
      disposers.push(render(() => <App />, host));
      flush();
      const screen = host.querySelector('.workspace');
      host.querySelector<HTMLAnchorElement>('.screen-route-control')!.click();
      flush();
      expect(location.pathname).toBe('/fullscreen');
      host.querySelector<HTMLAnchorElement>('.screen-route-control')!.click();
      flush();
      expect(location.pathname).toBe('/');
      expect(transition).toHaveBeenCalledTimes(2);
      expect(host.querySelector('.workspace')).toBe(screen);
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it('loads the deep link directly and preserves modified link activation', () => {
    window.history.replaceState(null, '', '/fullscreen');
    const route = createRoot((dispose) => {
      disposers.push(dispose);
      return createScreenRoute(
        () => true,
        () => undefined
      );
    });
    expect(route.fullscreen()).toBe(true);
    const event = new MouseEvent('click', { ctrlKey: true, cancelable: true });
    route.navigate(event, '/');
    expect(event.defaultPrevented).toBe(false);
    expect(location.pathname).toBe('/fullscreen');
  });

  it('flushes the route inside the native transition and ignores a stale update after disposal', () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const updates: (() => void)[] = [];
    const skip = vi.fn();
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: vi.fn((update: () => void) => {
        updates.push(update);
        return { skipTransition: skip, finished: Promise.resolve() };
      })
    });
    let dispose = () => {};
    const route = createRoot((cleanup) => {
      dispose = cleanup;
      disposers.push(cleanup);
      return createScreenRoute(
        () => false,
        () => undefined
      );
    });
    route.navigate(new MouseEvent('click'), '/fullscreen');
    updates.shift()!();
    expect(route.fullscreen()).toBe(true);
    route.navigate(new MouseEvent('click'), '/');
    dispose();
    updates.shift()!();
    expect(route.fullscreen()).toBe(true);
    expect(skip).toHaveBeenCalled();
  });

  it('animates the shared screen bounds when the native API is unavailable', () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const element = document.createElement('div');
    const animate = vi.fn<(frames: Keyframe[]) => { cancel: () => void }>(() => ({ cancel: vi.fn() }));
    Object.defineProperty(element, 'animate', { value: animate });
    vi.spyOn(element, 'getBoundingClientRect')
      .mockReturnValueOnce({ x: 30, y: 40, width: 300, height: 400 } as DOMRect)
      .mockReturnValue({ x: 0, y: 0, width: 600, height: 800 } as DOMRect);
    const route = createRoot((dispose) => {
      disposers.push(dispose);
      return createScreenRoute(
        () => false,
        () => element
      );
    });
    route.navigate(new MouseEvent('click'), '/fullscreen');
    expect(animate.mock.calls[0]?.[0]).toEqual(
      expect.arrayContaining([expect.objectContaining({ transform: 'translate(30px, 40px) scale(0.5, 0.5)' })])
    );
    expect(route.fullscreen()).toBe(true);
  });
});
