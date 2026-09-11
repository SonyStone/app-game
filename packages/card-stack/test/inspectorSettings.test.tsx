import { render } from '@solidjs/web';
import { createRoot, flush } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInspectorSetting, validMotionSelection, resolveElementLayers, type MotionSelection } from '../src/debug/createInspectorSetting';

const disposers: (() => void)[] = [];
afterEach(() => {
  disposers.splice(0).forEach(dispose => dispose());
  vi.restoreAllMocks();
  localStorage.clear();
  document.body.replaceChildren();
});

describe('inspector preferences', () => {
  it('restores independent layer choices inside a rendering owner and keeps scopes separate', () => {
    const first = createRoot(dispose => {
      disposers.push(dispose);
      return createInspectorSetting<MotionSelection>('notebook', 'elements', null, validMotionSelection);
    });
    first[1]({ notes: { onion: true, trajectory: false }, reading: { onion: false, trajectory: true } });
    flush();
    const host = document.createElement('div');
    document.body.append(host);
    disposers.push(render(() => {
      const [selection] = createInspectorSetting<MotionSelection>('notebook', 'elements', null, validMotionSelection);
      return <output>{JSON.stringify(selection())}</output>;
    }, host));
    flush();
    expect(JSON.parse(host.textContent!)).toEqual(first[0]());
    const other = createRoot(dispose => {
      disposers.push(dispose);
      return createInspectorSetting<MotionSelection>('folders', 'elements', null, validMotionSelection);
    });
    expect(other[0]()).toBeNull();
    first[1]({});
    expect(localStorage.getItem('motion-inspector:v1:notebook:elements')).toBe('{}');
  });

  it('preserves legacy pose visibility and keeps explicit visibility independent of overlays', () => {
    expect(resolveElementLayers({ onion: true, trajectory: false })).toEqual({ visible: true, onion: true, trajectory: false });
    expect(resolveElementLayers({ visible: false, onion: true, trajectory: true })).toEqual({ visible: false, onion: true, trajectory: true });
    expect(resolveElementLayers({ visible: true, onion: false, trajectory: false })).toEqual({ visible: true, onion: false, trajectory: false });
    expect(resolveElementLayers()).toEqual({ visible: false, onion: false, trajectory: false });
    expect(validMotionSelection({ card: { visible: 'yes', onion: false, trajectory: false } })).toBe(false);
  });

  it('uses defaults for malformed or invalid stored data', () => {
    for (const raw of ['{broken', '42', '{"notes":{"onion":"yes"}}']) {
      localStorage.setItem('motion-inspector:v1:invalid:elements', raw);
      const value = createRoot(dispose => {
        disposers.push(dispose);
        return createInspectorSetting<MotionSelection>('invalid', 'elements', null, validMotionSelection);
      });
      flush();
      expect(value[0]()).toBeNull();
    }
  });

  it('continues in memory when storage reads and writes throw', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
    const [value, setValue] = createRoot(dispose => {
      disposers.push(dispose);
      return createInspectorSetting('blocked', 'duration', 5, value => typeof value === 'number');
    });
    setValue(12);
    flush();
    expect(value()).toBe(12);
  });
});
