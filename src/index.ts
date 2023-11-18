import '@unocss/reset/tailwind.css';
import 'uno.css';
import './index.scss';

import { Router } from '@solidjs/router';
import { createApp } from 'solid-utils';

import { MetaProvider } from '@solidjs/meta';
import { App } from './App';
import { StatsProvider } from './Stats.provider';
import { CameraProvider } from './three/Camera.provider';

createApp(App)
  .use(MetaProvider)
  .use(Router)
  .use(StatsProvider)
  .use(CameraProvider)
  .mount(document.body as HTMLElement);
