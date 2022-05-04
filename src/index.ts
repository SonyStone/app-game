import './index.scss';

import { Router } from 'solid-app-router';
import { createApp } from 'solid-utils';

import { App } from './App';
import { StatsProvider } from './Stats.provider';
import { CameraProvider } from './three/Camera.provider';

createApp(App)
  .use(Router)
  .use(StatsProvider)
  .use(CameraProvider)
  .mount(document.body as HTMLElement);
