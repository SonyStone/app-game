import { type Routes } from '@app-game/app-router';
import { Ripple } from '@app-game/ui-components/ripple';

import { lazy } from 'solid-js';

export const gsapExamplesRoutes: Routes = {
  path: '/gsap-scroll-trigger-svg-text-mask',
  name: 'ScrollTrigger: SVG Text Mask',
  Preview: (props) => (
    <a
      class="rounded-2 relative flex aspect-square w-full flex-col place-content-center place-items-center gap-1.5 overflow-hidden bg-slate-200 p-2 px-4"
      href={props.path}
    >
      <h2 class="text-4xl">GSAP</h2>
      <span class="text-center text-sm">{props.name}</span>
      <div class="absolute -end-2 bottom-1">
        <span class="text-4rem leading-6">💫</span>
      </div>
      <Ripple class="text-slate/20" />
    </a>
  ),
  component: lazy(() => import('./scroll-trigger-svg-text-mask/scroll-trigger-svg-text-mask'))
};
