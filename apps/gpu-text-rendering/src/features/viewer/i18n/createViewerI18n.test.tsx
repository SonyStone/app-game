import { createRouter, memoryHistory } from '@solidjs/router';
import { render } from '@solidjs/web';
import { flush } from 'solid-js';
import { describe, expect, it } from 'vitest';
import { createViewerI18n, resolveLocale } from './createViewerI18n';

it.each([undefined, null, '', 'unknown', ['he'], '__proto__'])('defaults invalid locale %s to English', (value) => {
  expect(resolveLocale(value)).toBe('en');
});

describe('router locale integration', () => {
  it('reacts to navigation without remounting and preserves the host route, query and fragment', async () => {
    const history = memoryHistory('/gpu-text-rendering?file=demo#pages');
    let i18n!: ReturnType<typeof createViewerI18n>;
    let mounts = 0;
    const Router = createRouter({
      history,
      routes: [
        {
          path: '/gpu-text-rendering',
          component: () => {
            mounts++;
            i18n = createViewerI18n();
            return (
              <div lang={i18n.locale()} dir={i18n.direction()}>
                {i18n.t('open')}
              </div>
            );
          }
        }
      ]
    });
    const host = document.createElement('div');
    document.body.append(host);
    const dispose = render(() => <Router />, host);
    try {
      await settle();
      expect(host.textContent).toBe('Open document');
      for (const [locale, label] of [
        ['ru', 'Открыть документ'],
        ['es', 'Abrir documento'],
        ['de', 'Dokument öffnen'],
        ['ja', 'ドキュメントを開く'],
        ['zh', '打开文档'],
        ['he', 'פתיחת מסמך']
      ]) {
        i18n.setLocale(locale!);
        await settle();
        expect(host.textContent).toBe(label);
        expect(history.get()).toBe(`/gpu-text-rendering?file=demo&lang=${locale}#pages`);
      }
      expect(host.firstElementChild?.getAttribute('dir')).toBe('rtl');
      history.back();
      await settle();
      expect(i18n.locale()).toBe('zh');
      expect(host.firstElementChild?.getAttribute('dir')).toBe('ltr');
      history.forward();
      await settle();
      expect(i18n.locale()).toBe('he');
      i18n.setLocale('en');
      await settle();
      expect(history.get()).toBe('/gpu-text-rendering?file=demo#pages');
      expect(mounts).toBe(1);
    } finally {
      dispose();
      host.remove();
    }
  });
});

async function settle() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
    flush();
  }
}
