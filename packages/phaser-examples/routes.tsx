import { Navigation } from '@packages/app-router/components/navigation';
import { SectionTitle } from '@packages/app-router/components/section-title';
import { Thumbnail } from '@packages/app-router/components/thumbnail';
import { Routes } from '@packages/app-router/routes.interface';
import { Ripple } from '@packages/ui-components/ripple/Ripple';
import { A } from '@solidjs/router';
import { lazy } from 'solid-js';
import baseTileSizeThumbnail from './base-tile-size-thumbnail.png?url';
import breakoutThumbnail from './breakout-thumbnail.png?url';
import phaserThumbnail from './chrome_2023-11-18_15-46-29.png?url';
import multipleLayersThumbnail from './multiple-layers-thumbnail.png?url';
import rpgGamesThumbnail from './rpg-games.png?url';

const phaserRoutes: Routes[] = [
  {
    path: '/tilemap/layer-with-multiple-layers',
    name: 'Multiple Layers',
    Preview: (props) => <Thumbnail href={props.path} thumbnail={multipleLayersThumbnail} name={props.name} />,
    component: lazy(() => import('@packages/phaser-examples/tilemap/layer-with-multiple-layers'))
  },
  {
    path: '/tilemap/base-tile-size',
    name: 'Base Tile Size',
    Preview: (props) => <Thumbnail href={props.path} thumbnail={baseTileSizeThumbnail} name={props.name} />,
    component: lazy(() => import('@packages/phaser-examples/tilemap/base-tile-size'))
  },
  {
    path: '/rpg-game',
    name: 'RPG Game',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} thumbnail={rpgGamesThumbnail} />,
    component: lazy(() => import('@packages/phaser-examples/rpg/rpg-game'))
  },
  {
    path: '/phaser-game',
    name: 'Phaser',
    Preview: (props) => <Thumbnail href={props.path} thumbnail={phaserThumbnail} name={props.name} />,
    component: lazy(() => import('@packages/phaser-examples/phaser/Game'))
  },
  {
    path: '/breakout',
    name: 'Breakout',
    Preview: (props) => <Thumbnail href={props.path} thumbnail={breakoutThumbnail} name={props.name} />,
    component: lazy(() => import('@packages/phaser-examples/breakout'))
  }
];

export const routes: Routes = {
  path: '/phaser-examples',
  name: 'Phaser Examples',
  Preview: (props) => (
    <A href={props.path} class="rounded-2 relative">
      <SectionTitle name={props.name} />
      <Ripple class="text-slate/20" />
    </A>
  ),
  children: [
    {
      path: '/',
      component: () => <Navigation routes={phaserRoutes} parentPath="." />
    },
    ...phaserRoutes
  ]
};
