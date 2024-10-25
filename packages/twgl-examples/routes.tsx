import { Thumbnail } from '@packages/ui-components/thumbnail';
import { lazy } from 'solid-js';
import { Routes } from 'src/routes.interface';

export const routes: Routes[] = [
  {
    path: '/uniform-buffer-objects',
    name: 'Uniform Buffer Objects',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} />,
    component: lazy(() => import('@packages/twgl-examples/uniform-buffer-objects/uniform-buffer-objects'))
  }
];
