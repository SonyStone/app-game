import { render } from '@solidjs/web';
import { createSignal, flush } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CardStack } from '../src';
import motionStyles from '../src/CardStack.module.css';

const disposers: (() => void)[] = [];
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('public CardStack interface', () => {
  it('updates expanded spacing without replacing cards, input state or selection', () => {
    const f = fixture();
    const panel = f.panel('beta');
    const input = panel.querySelector('input')!;
    input.value = 'Keep my draft';
    const offset = () => parseFloat((panel.parentElement as HTMLElement).style.getPropertyValue('--offset'));
    const initial = offset();
    expect(initial).toBeGreaterThan(0);
    for (const spacing of [2, 0.5, 1.5, 1]) {
      f.setSpacing(spacing);
      flush();
      expect(offset()).toBeCloseTo(initial * spacing);
      expect(f.panel('beta')).toBe(panel);
      expect(input.value).toBe('Keep my draft');
      expect(f.tab('beta').getAttribute('aria-selected')).toBe('true');
      expect(f.mounts()).toBe(2);
    }
    for (const invalid of [0, -1, NaN, Infinity]) {
      f.setSpacing(invalid);
      flush();
      expect(offset()).toBe(initial);
    }
  });

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

  it('reuses the mounted panels throughout selection without creating snapshot copies', () => {
    const f = fixture();
    const panel = f.panel('beta');
    f.tab('alpha').click();
    flush();
    expect(f.host.querySelector('[data-tabs-echo]')).toBeNull();
    expect(f.host.querySelectorAll('input')).toHaveLength(2);
    f.finish('beta', 'tabs-exit');
    expect(f.panel('beta')).toBe(panel);
    expect(f.mounts()).toBe(2);
    f.finish('beta', 'tabs-return');
    expect(f.panel('beta')).toBe(panel);
  });

  it('caps exposed cards while retaining all mounted content and accepts reactive limits', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const [limit, setLimit] = createSignal<number | undefined>();
    const items = Array.from({ length: 40 }, (_, index) => ({ id: `card-${index}` }));
    disposers.push(
      render(
        () => (
          <CardStack
            items={items}
            maxExpandedCards={limit()}
            label="Large deck"
            getLabel={(item) => item.id}
            renderTab={(item) => item.id}
          >
            {(item) => <input aria-label={item.id} />}
          </CardStack>
        ),
        host
      )
    );
    flush();
    const exposed = () => [...host.querySelectorAll<HTMLElement>('[data-tabs-card]:not([data-stack-hidden])')];
    expect(exposed()).toHaveLength(8);
    expect(exposed().at(-1)?.dataset.tabsCard).toBe('card-39');
    expect(host.querySelectorAll('input')).toHaveLength(40);
    const lastPanel = host.querySelector('[data-tabs-card="card-39"]');
    setLimit(4);
    flush();
    expect(exposed()).toHaveLength(4);
    setLimit(12);
    flush();
    expect(exposed()).toHaveLength(12);
    setLimit(Infinity);
    flush();
    expect(exposed()).toHaveLength(40);
    expect(host.querySelector('[data-tabs-card="card-39"]')).toBe(lastPanel);
  });
});

function fixture(onChange?: (order: readonly string[]) => void, initialTabOrder?: readonly string[]) {
  const host = document.createElement('div');
  document.body.append(host);
  let mounts = 0;
  const [order, setOrder] = createSignal<readonly string[]>(['alpha', 'beta']);
  const [spacing, setSpacing] = createSignal(1);
  disposers.push(
    render(
      () => (
        <CardStack
          items={[{ id: 'alpha' }, { id: 'beta' }]}
          expandedSpacing={spacing()}
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
        </CardStack>
      ),
      host
    )
  );
  flush();
  return {
    host,
    setSpacing,
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
