import { Navigation, SectionTitle, Thumbnail, type Routes } from '@app-game/app-router';
import { Ripple } from '@app-game/ui-components/ripple';
import { A } from '@solidjs/router';
import { lazy } from 'solid-js';
import baseTileSizeThumbnail from './base-tile-size-thumbnail.png?url';
import breakoutThumbnail from './breakout-thumbnail.png?url';
import phaserThumbnail from './chrome_2023-11-18_15-46-29.png?url';
import multipleLayersThumbnail from './multiple-layers-thumbnail.png?url';
import rpgGamesThumbnail from './rpg-games.png?url';
import worldBodiesThumbnail from './world-rodies-thumbnail.png?url';

const routes: Routes[] = [
  {
    path: '/tilemap/layer-with-multiple-layers',
    name: 'Multiple Layers',
    Preview: (props) => <Thumbnail href={props.path} thumbnail={multipleLayersThumbnail} name={props.name} />,
    component: lazy(() => import('./tilemap/layer-with-multiple-layers'))
  },
  {
    path: '/tilemap/base-tile-size',
    name: 'Base Tile Size',
    Preview: (props) => <Thumbnail href={props.path} thumbnail={baseTileSizeThumbnail} name={props.name} />,
    component: lazy(() => import('./tilemap/base-tile-size'))
  },
  {
    path: '/rpg-game',
    name: 'RPG Game',
    Preview: (props) => <Thumbnail href={props.path} name={props.name} thumbnail={rpgGamesThumbnail} />,
    component: lazy(() => import('./rpg/rpg-game'))
  },
  {
    path: '/phaser-game',
    name: 'Phaser',
    Preview: (props) => <Thumbnail href={props.path} thumbnail={phaserThumbnail} name={props.name} />,
    component: lazy(() => import('./phaser/Game'))
  },
  {
    path: '/breakout',
    name: 'Breakout',
    Preview: (props) => <Thumbnail href={props.path} thumbnail={breakoutThumbnail} name={props.name} />,
    component: lazy(() => import('./breakout'))
  },
  {
    path: '/100-world-bodies',
    name: '100 world bodies',
    Preview: (props) => <Thumbnail href={props.path} thumbnail={worldBodiesThumbnail} name={props.name} />,
    component: lazy(() => import('./physics/matterjs/100 world bodies'))
  }
];

export const phaserRoutes: Routes = {
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
      component: () => <Navigation routes={routes} parentPath="." />
    },
    ...routes
  ]
};
