import '@unocss/reset/tailwind.css';
import 'uno.css';
import './index.scss';

import { createApp } from 'solid-utils';

import { CameraProvider } from '@app-game/three-examples';
import { MetaProvider } from '@solidjs/meta';
import { App } from './App';
import { StatsProvider } from './Stats.provider';

const root = document.getElementById('app');

if (!root) {
  throw new Error('Root element not found');
}

createApp(App).use(MetaProvider).use(StatsProvider).use(CameraProvider).mount(root);
