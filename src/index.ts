import './index.scss';

import { Router } from 'solid-app-router';
import { createApp } from 'solid-utils';

import { App } from './App';

createApp(App)
  .use(Router)
  .mount(document.body as HTMLElement);
