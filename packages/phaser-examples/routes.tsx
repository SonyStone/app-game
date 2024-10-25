import { Thumbnail } from '@packages/ui-components/thumbnail';
import { lazy } from 'solid-js';
import { Routes } from 'src/routes.interface';
import baseTileSizeThumbnail from './base-tile-size-thumbnail.png?url';
import breakoutThumbnail from './breakout-thumbnail.png?url';
import phaserThumbnail from './chrome_2023-11-18_15-46-29.png?url';
import multipleLayersThumbnail from './multiple-layers-thumbnail.png?url';
import rpgGamesThumbnail from './rpg-games.png?url';

export const routes: Routes[] = [
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
