import {
  AnimatedSprite as _AnimatedSprite,
  BitmapText as _BitmapText,
  Container as _Container,
  Culler as _Culler,
  Graphics as _Graphics,
  HTMLText as _HTMLText,
  Mesh as _Mesh,
  MeshGeometry as _MeshGeometry,
  MeshPlane as _MeshPlane,
  MeshRope as _MeshRope,
  MeshSimple as _MeshSimple,
  NineSliceGeometry as _NineSliceGeometry,
  NineSliceSprite as _NineSliceSprite,
  Particle as _Particle,
  ParticleContainer as _ParticleContainer,
  PerspectiveMesh as _PerspectiveMesh,
  PerspectivePlaneGeometry as _PerspectivePlaneGeometry,
  PlaneGeometry as _PlaneGeometry,
  RenderContainer as _RenderContainer,
  RenderLayer as _RenderLayer,
  RopeGeometry as _RopeGeometry,
  Sprite as _Sprite,
  Text as _Text,
  TilingSprite as _TilingSprite,
  type AnimatedSpriteOptions,
  type ContainerOptions,
  type GraphicsOptions,
  type HTMLTextOptions,
  type MeshGeometryOptions,
  type MeshOptions,
  type MeshPlaneOptions,
  type MeshRopeOptions,
  type NineSliceGeometryOptions,
  type NineSliceSpriteOptions,
  type ParticleContainerOptions,
  type ParticleOptions,
  type PerspectivePlaneGeometryOptions,
  type PerspectivePlaneOptions,
  type PlaneGeometryOptions,
  type RenderContainerOptions,
  type RenderLayerOptions,
  type RopeGeometryOptions,
  type SimpleMeshOptions,
  type SpriteOptions,
  type TextOptions,
  type TilingSpriteOptions
} from 'pixi.js';
import { JSX, splitProps, type Ref } from 'solid-js';
import { CommonPropKeys } from './interfaces';
import { insert, spread } from './runtime';

function createPixiComponent<T, O>(PixiComponent: new (options: O) => T) {
  return function (props: Omit<Partial<O>, 'children'> & Partial<{ children: JSX.Element; as: T; ref: Ref<T> }>) {
    const [common, pixis] = splitProps(props, CommonPropKeys);

    const as = common.as || new PixiComponent(pixis as O);
    spread(as, pixis);
    insert(as, () => common.children);
    return as as T & JSX.Element;
  };
}

/** Base class for grouping objects */
export const Container = createPixiComponent<_Container, ContainerOptions>(_Container);

/** Basic image display */
export const Sprite = createPixiComponent<_Sprite, SpriteOptions>(_Sprite);
/** Sprite animation support */
export const AnimatedSprite = createPixiComponent<_AnimatedSprite, AnimatedSpriteOptions>(_AnimatedSprite);
/** Repeating texture patterns */
export const TilingSprite = createPixiComponent<_TilingSprite, TilingSpriteOptions>(_TilingSprite);
/** Scalable UI elements */
export const NineSliceSprite = createPixiComponent<_NineSliceSprite, NineSliceSpriteOptions>(_NineSliceSprite);

/** Canvas-based text rendering */
export const Text = createPixiComponent<_Text, TextOptions>(_Text);
/** HTML/CSS-based text */
export const HTMLText = createPixiComponent<_HTMLText, HTMLTextOptions>(_HTMLText);
/** High-performance bitmap fonts */
export const BitmapText = createPixiComponent<_BitmapText, TextOptions>(_BitmapText);

/** Vector shape drawing */
export const Graphics = createPixiComponent<_Graphics, GraphicsOptions>(_Graphics);

/** Custom vertex-based rendering */
export const Mesh = createPixiComponent<_Mesh, MeshOptions>(_Mesh);
/** Basic mesh with convenient constructor */
export const MeshSimple = createPixiComponent<_MeshSimple, SimpleMeshOptions>(_MeshSimple);
/** Deformable textured plane */
export const MeshPlane = createPixiComponent<_MeshPlane, MeshPlaneOptions>(_MeshPlane);
/** Rope-like curved mesh */
export const MeshRope = createPixiComponent<_MeshRope, MeshRopeOptions>(_MeshRope);

export const PerspectiveMesh = createPixiComponent<_PerspectiveMesh, PerspectivePlaneOptions>(_PerspectiveMesh);

/** Optimized container for particle systems */
export const ParticleContainer = createPixiComponent<_ParticleContainer, ParticleContainerOptions>(_ParticleContainer);
export const Particle = createPixiComponent<_Particle, ParticleOptions>(_Particle);

/** Geometry for custom mesh shapes */
export const MeshGeometry = createPixiComponent<_MeshGeometry, MeshGeometryOptions>(_MeshGeometry);
export const NineSliceGeometry = createPixiComponent<_NineSliceGeometry, NineSliceGeometryOptions>(_NineSliceGeometry);
export const PlaneGeometry = createPixiComponent<_PlaneGeometry, PlaneGeometryOptions>(_PlaneGeometry);
export const PerspectivePlaneGeometry = createPixiComponent<_PerspectivePlaneGeometry, PerspectivePlaneGeometryOptions>(
  _PerspectivePlaneGeometry
);
export const RopeGeometry = createPixiComponent<_RopeGeometry, RopeGeometryOptions>(_RopeGeometry);

export const Culler = createPixiComponent<_Culler, unknown>(_Culler);

export const RenderContainer = createPixiComponent<_RenderContainer, RenderContainerOptions>(_RenderContainer);
export const RenderLayer = createPixiComponent<InstanceType<typeof _RenderLayer>, RenderLayerOptions>(_RenderLayer);
