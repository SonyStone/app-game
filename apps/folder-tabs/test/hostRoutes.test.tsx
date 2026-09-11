import { createRouter } from '@solidjs/router';
import { render } from '@solidjs/web';
import { flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import RoutedFolders from '../src/RoutedFolders';
import RoutedNotebook from '../src/RoutedNotebook';
import { Notebook } from '../examples/Notebook';
import appStyles from '../src/App.module.css';

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

it('uses host paths and preserves the deck through fullscreen and browser back', async () => {
  const host = mount('/card-stack');
  expect(host.querySelector('[data-motion-debug]')).toBeNull();
  const panel = host.querySelector('#panel-music');
  const screen = host.querySelector(`.${appStyles.workspace}`);
  host.querySelector<HTMLAnchorElement>('a[href="/card-stack/fullscreen"]')!.click();
  await vi.waitFor(() => expect(location.pathname).toBe('/card-stack/fullscreen'));
  expect(host.querySelector(`.${appStyles.isFullscreen}`)).not.toBeNull();
  expect(host.querySelector('[data-motion-debug]')).toBeNull();
  expect(host.querySelector('#panel-music')).toBe(panel);
  expect(host.querySelector('a[href="/card-stack"]')).not.toBeNull();
  window.history.back();
  await vi.waitFor(() => expect(location.pathname).toBe('/card-stack'));
  flush();
  expect(host.querySelector(`.${appStyles.isFullscreen}`)).toBeNull();
  expect(host.querySelector(`.${appStyles.workspace}`)).toBe(screen);
});

it('loads nested fullscreen and notebook routes without mounting into the document root', async () => {
  const host = mount('/card-stack/fullscreen');
  expect(host.querySelector(`.${appStyles.isFullscreen}`)).not.toBeNull();
  host.querySelector<HTMLAnchorElement>('a[href="/card-stack"]')!.click();
  await vi.waitFor(() => expect(location.pathname).toBe('/card-stack'));
  host.querySelector<HTMLAnchorElement>('a[href="/card-stack/notebook"]')!.click();
  await vi.waitFor(() => expect(host.querySelector('[aria-label="Notebooks"]')).not.toBeNull());
  expect(host.querySelector('a[href="/card-stack"]')).not.toBeNull();
  expect(host.querySelector(`.${appStyles.workspace}`)).toBeNull();
  expect(host.querySelectorAll('[data-motion-debug]')).toHaveLength(1);
  expect(host.querySelector('[data-motion-debug]')?.textContent).toContain('Onion skin');
  expect(host.querySelector('[data-motion-debug]')?.textContent).not.toMatch(/[А-Яа-яЁё]/);
});

it('leaves the standalone notebook without an inspector', () => {
  const host = document.createElement('div');
  document.body.append(host);
  dispose = render(() => <Notebook />, host);
  flush();
  expect(host.querySelector('[data-motion-debug]')).toBeNull();
});

/** Runs the real host router to catch history and parent-route remount regressions. */
function mount(path: string) {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  window.history.replaceState(null, '', path);
  const Router = createRouter({
    routes: [
      {
        path: '/card-stack',
        component: RoutedFolders,
        children: [{ path: '/' }, { path: '/fullscreen' }]
      },
      { path: '/card-stack/notebook', component: RoutedNotebook }
    ]
  });
  const host = document.createElement('div');
  document.body.append(host);
  dispose = render(() => <Router />, host);
  flush();
  return host;
}
