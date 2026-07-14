import { createMemo, createSignal, type Accessor } from 'solid-js';

import type { AppHostService, FullscreenService } from '../../editor/kernel';
import type { AppSettings } from '../../editor/types';
import { createFullscreen } from '../fullscreen/createFullscreen';
import { appRootBaseClass, appRootThemeClass, createAppThemeVars } from './app-theme';

export interface CreateAppHostServicesOptions {
  readonly settings: Accessor<AppSettings>;
  readonly dropActive: Accessor<boolean>;
}

export interface AppHostServices {
  readonly appHost: AppHostService;
  readonly fullscreen: FullscreenService;
}

export function createAppHostServices(options: CreateAppHostServicesOptions): AppHostServices {
  const [rootElement, setRootElement] = createSignal<HTMLDivElement>();
  const setRootRef = (element: HTMLDivElement): void => {
    setRootElement(element);
  };
  const fullscreen = createFullscreen(rootElement);
  const themeVars = createMemo(() => createAppThemeVars(options.settings()));
  const className = createMemo(() =>
    [appRootBaseClass, appRootThemeClass[options.settings().themePreset], options.dropActive() ? 'svg-drop-active' : '']
      .filter(Boolean)
      .join(' ')
  );

  return {
    appHost: {
      setRootRef,
      className,
      themeVars
    },
    fullscreen: {
      isFullscreen: fullscreen.isFullscreen,
      toggle: fullscreen.toggleFullscreen
    }
  } satisfies AppHostServices;
}
