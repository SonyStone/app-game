import { createRoot, createSignal } from 'solid-js';
import { describe, expect, it } from 'vitest';

import { defaultSettings } from '../src/editor/defaults';
import { createAppHostServices } from '../src/features/shell/createAppHostServices';

describe('app host services', () => {
  it('projects root host classes, theme variables, and fullscreen controls', () => {
    createRoot((dispose) => {
      const [settings, setSettings] = createSignal(defaultSettings());
      const [dropActive, setDropActive] = createSignal(false);
      const services = createAppHostServices({ settings, dropActive });

      expect(services.appHost.className()).toContain('app-root');
      expect(services.appHost.className()).not.toContain('svg-drop-active');
      expect(services.appHost.themeVars()).toMatchObject({ '--base': settings().baseColor });
      expect(services.fullscreen.isFullscreen()).toBe(false);
      expect(services.fullscreen.toggle).toBeTypeOf('function');

      setDropActive(true);
      expect(services.appHost.className()).toContain('svg-drop-active');

      setSettings((current) => ({ ...current, themePreset: 'light', baseColor: '#123456' }));
      expect(services.appHost.className()).toContain('theme-light');
      expect(services.appHost.themeVars()).toMatchObject({ '--base': '#123456' });

      services.appHost.setRootRef(document.createElement('div'));

      dispose();
    });
  });
});
