import { CameraProvider } from '@app-game/three-examples';
import { createComponent, render } from '@solidjs/web';
import 'uno.css';
import reset from '../../../packages/styles/reset.module.css';
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

// Scope the utility baseline to this standalone document.
document.body.classList.add(reset.root, 'app-utilities');
