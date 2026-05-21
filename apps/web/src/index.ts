import { CameraProvider } from '@app-game/three-examples';
import { MetaProvider } from '@solidjs/meta';
import '@unocss/reset/tailwind.css';
import { createApp } from 'solid-utils';
import 'uno.css';
import { App } from './App';
import { StatsProvider } from './Stats.provider';

createApp(App).use(MetaProvider).use(StatsProvider).use(CameraProvider).mount(document.body);
