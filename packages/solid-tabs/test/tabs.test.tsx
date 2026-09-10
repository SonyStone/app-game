import { render } from '@solidjs/web';
import { createSignal, flush } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tabs } from '../src';
import motionStyles from '../src/Tabs.module.css';

const disposers: (() => void)[] = [];
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('public Tabs interface', () => {
  it('accepts arbitrary content and styling without folder metadata', () => {
    const f = fixture();
    expect(f.host.querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe('Documents');
    expect(f.host.querySelector('[aria-selected="true"]')?.textContent).toBe('Document beta');
    expect(f.host.querySelector('[data-tabs-card="alpha"]')?.getAttribute('style')).toContain('--tabs-surface: coral');
    expect(f.host.querySelector('svg, .folder-tab, .folder-sheet')).toBeNull();
  });

  it('attaches module classes while retaining caller styling and ignores unrelated animations', () => {
    const f = fixture();
    expect(f.host.querySelector('[data-tabs-root]')?.classList.contains(motionStyles.root!)).toBe(true);
    expect(f.tab('alpha').classList.contains(motionStyles.trigger!)).toBe(true);
    expect(f.panel('alpha').classList.contains(motionStyles.panel!)).toBe(true);
    f.tab('alpha').click();
    flush();
    f.finish('beta', 'unrelated-animation');
    expect(f.host.querySelector('[data-tabs-root]')?.getAttribute('data-motion')).toBe('departing');
    f.finish('beta', 'tabs-exit');
    expect(f.tab('alpha').getAttribute('aria-selected')).toBe('true');
  });

  it('commits depth internally and retains the mounted panel input', () => {
    const f = fixture();
    const input = f.panel('beta').querySelector('input')!;
    input.value = 'Keep my draft';
    f.tab('alpha').click();
    flush();
    f.finish('beta', 'tabs-exit');
    expect(f.tab('alpha').getAttribute('aria-selected')).toBe('true');
    f.finish('beta', 'tabs-return');
    f.tab('beta').click();
    flush();
    f.finish('alpha', 'tabs-exit');
    expect(f.panel('beta').querySelector('input')).toBe(input);
    expect(input.value).toBe('Keep my draft');
  });

  it('allows controlled depth and notifies the caller only at the transition commit', () => {
    const changed = vi.fn();
    const f = fixture(changed);
    f.tab('alpha').click();
    flush();
    expect(changed).not.toHaveBeenCalled();
    f.finish('beta', 'tabs-exit');
    expect(changed).toHaveBeenCalledExactlyOnceWith(['beta', 'alpha']);
    expect(f.panel('beta').hasAttribute('inert')).toBe(true);
    expect(f.panel('alpha').hasAttribute('inert')).toBe(false);
  });

  it('gives multiple decks independent DOM IDs and keyboard focus', () => {
    const a = fixture();
    const b = fixture();
    expect(a.tab('alpha').id).not.toBe(b.tab('alpha').id);
    b.tab('beta').dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Home' }));
    flush();
    expect(document.activeElement).toBe(b.tab('alpha'));
    expect(a.host.querySelector('[data-tabs-root]')?.getAttribute('data-motion')).toBe('idle');
    expect(b.host.querySelector('[data-tabs-root]')?.getAttribute('data-motion')).toBe('departing');
    for (const f of [a, b]) {
      expect(f.tab('alpha').getAttribute('aria-controls')).toBe(f.panel('alpha').id);
      expect(f.panel('alpha').getAttribute('aria-labelledby')).toBe(f.tab('alpha').id);
    }
  });

  it('keeps initial horizontal order independent of the open card', () => {
    const f = fixture(undefined, ['beta', 'alpha']);
    expect(f.host.querySelector('[data-tabs-root]')?.getAttribute('data-tab-order')).toBe('beta alpha');
    expect(f.tab('beta').getAttribute('aria-selected')).toBe('true');
    f.tab('beta').dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'End' }));
    flush();
    expect(document.activeElement).toBe(f.tab('alpha'));
  });

  it('snapshots every panel child without duplicate IDs or mounting more application effects', async () => {
    const f = fixture();
    f.tab('alpha').click();
    flush();
    await Promise.resolve();
    const echo = f.host.querySelector('[data-tabs-echo]')!;
    expect(echo.querySelector('[id]')).toBeNull();
    expect(echo.querySelectorAll('input')).toHaveLength(1);
    expect(echo.querySelector('p')?.textContent).toBe('Second panel child');
    expect(echo.hasAttribute('inert')).toBe(true);
    expect(f.mounts()).toBe(2);
  });
});

function fixture(onChange?: (order: readonly string[]) => void, initialTabOrder?: readonly string[]) {
  const host = document.createElement('div');
  document.body.append(host);
  let mounts = 0;
  const [order, setOrder] = createSignal<readonly string[]>(['alpha', 'beta']);
  disposers.push(
    render(
      () => (
        <Tabs
          items={[{ id: 'alpha' }, { id: 'beta' }]}
          {...(initialTabOrder ? { initialTabOrder } : {})}
          {...(onChange
            ? {
                get order() {
                  return order();
                },
                onOrderChange: (value: readonly string[]) => {
                  setOrder(value);
                  onChange(value);
                }
              }
            : {})}
          label="Documents"
          getLabel={(item) => `Document ${item.id}`}
          renderTab={(item) => <span>Document {item.id}</span>}
          cardStyle={() => ({ '--tabs-surface': 'coral' })}
        >
          {(item) => {
            mounts++;
            return (
              <>
                <input id={`draft-${item.id}`} aria-label={`Draft ${item.id}`} />
                <p>Second panel child</p>
              </>
            );
          }}
        </Tabs>
      ),
      host
    )
  );
  flush();
  return {
    host,
    mounts: () => mounts,
    tab: (id: string) => host.querySelector<HTMLButtonElement>(`button[data-tabs-trigger="${id}"]`)!,
    panel: (id: string) => host.querySelector<HTMLElement>(`[data-tabs-card="${id}"] [role="tabpanel"]`)!,
    finish(id: string, animationName: string) {
      const event = new Event('animationend', { bubbles: true });
      Object.defineProperty(event, 'animationName', {
        value:
          animationName === 'tabs-exit'
            ? motionStyles.tabsExit
            : animationName === 'tabs-return'
              ? motionStyles.tabsReturn
              : animationName
      });
      host.querySelector(`[data-tabs-card="${id}"]`)!.dispatchEvent(event);
      flush();
    }
  };
}
