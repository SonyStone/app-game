import { CameraProvider } from '@app-game/three-examples';
import { createComponent, render } from '@solidjs/web';
import '@unocss/reset/tailwind.css';
import 'uno.css';
import { App } from './App';
import { StatsProvider } from './Stats.provider';

const root = document.getElementById('app');

if (!root) {
  throw new Error('Missing #app mount element');
}

render(
  () =>
    createComponent(StatsProvider, {
      get children() {
        return createComponent(CameraProvider, {
          get children() {
            return createComponent(App, {});
          }
        });
      }
    }),
  root
);
