import { countPages, type FolderGroups, type Routes } from '@app-game/app-router';
import { escyRoutes } from '@app-game/ecsy-pages/routes';
import { mathRoutes } from '@app-game/math-examples/routes';
import { oglRoutes } from '@app-game/ogl-examples/routes';
import { paintFolderGroups, paintRoutes } from '@app-game/paint-examples/routes';
import { phaserRoutes } from '@app-game/phaser-examples/routes';
import { threeRoutes } from '@app-game/three-examples';
import { twglRoutes } from '@app-game/twgl-examples/routes';
import { typegpuRoutes } from '@app-game/typegpu-examples/routes';
import { uiComponentsRoutes } from '@app-game/ui-components-examples/routes';
import { wasmRustRoutes } from '@app-game/wasm-rust-pages/routes';
import { webglExamplesRoute } from '@app-game/webgl-examples/routes';
import { webgpuRoutes } from '@app-game/webgpu-examples/routes';
import binaryTreeIcon from '@tabler/icons/outline/binary-tree.svg?url';
import brandRustIcon from '@tabler/icons/outline/brand-rust.svg?url';
import brandThreejsIcon from '@tabler/icons/outline/brand-threejs.svg?url';
import brushIcon from '@tabler/icons/outline/brush.svg?url';
import buildingCastleIcon from '@tabler/icons/outline/building-castle.svg?url';
import cardsIcon from '@tabler/icons/outline/cards.svg?url';
import codeIcon from '@tabler/icons/outline/code.svg?url';
import componentsIcon from '@tabler/icons/outline/components.svg?url';
import cpuIcon from '@tabler/icons/outline/cpu.svg?url';
import cube3dSphereIcon from '@tabler/icons/outline/cube-3d-sphere.svg?url';
import cubeIcon from '@tabler/icons/outline/cube.svg?url';
import deviceGamepadIcon from '@tabler/icons/outline/device-gamepad-2.svg?url';
import dragDropIcon from '@tabler/icons/outline/drag-drop.svg?url';
import ghostIcon from '@tabler/icons/outline/ghost-2.svg?url';
import hexagonsIcon from '@tabler/icons/outline/hexagons.svg?url';
import listDetailsIcon from '@tabler/icons/outline/list-details.svg?url';
import mathFunctionIcon from '@tabler/icons/outline/math-function.svg?url';
import movieIcon from '@tabler/icons/outline/movie.svg?url';
import notebookIcon from '@tabler/icons/outline/notebook.svg?url';
import paletteIcon from '@tabler/icons/outline/palette.svg?url';
import rocketIcon from '@tabler/icons/outline/rocket.svg?url';
import schemaIcon from '@tabler/icons/outline/schema.svg?url';
import scribbleIcon from '@tabler/icons/outline/scribble.svg?url';
import sitemapIcon from '@tabler/icons/outline/sitemap.svg?url';
import sparklesIcon from '@tabler/icons/outline/sparkles.svg?url';
import stackIcon from '@tabler/icons/outline/stack-2.svg?url';
import swordIcon from '@tabler/icons/outline/sword.svg?url';
import tankIcon from '@tabler/icons/outline/tank.svg?url';
import topologyIcon from '@tabler/icons/outline/topology-star-3.svg?url';
import triangleIcon from '@tabler/icons/outline/triangle.svg?url';
import typographyIcon from '@tabler/icons/outline/typography.svg?url';
import vectorBezierIcon from '@tabler/icons/outline/vector-bezier-2.svg?url';
import waveSineIcon from '@tabler/icons/outline/wave-sine.svg?url';
import worldIcon from '@tabler/icons/outline/world.svg?url';
import zoomScanIcon from '@tabler/icons/outline/zoom-scan.svg?url';
import cardStackPreview from '../previews/card-stack.webp?url';
import gpuTextPreview from '../previews/gpu-text.webp?url';
import greasePencilPreview from '../previews/grease-pencil.webp?url';
import nightDefensePreview from '../previews/night-defense.webp?url';
import paintDemoFillPreview from '../previews/pages/paint/demo-fill.webp?url';
import paintDesktopPreview from '../previews/pages/paint/desktop.webp?url';
import paintDeckPreview from '../previews/paint-deck.webp?url';
import paintDialPreview from '../previews/paint-dial.webp?url';
import paintGlassPreview from '../previews/paint-glass.webp?url';
import paintHudPreview from '../previews/paint-hud.webp?url';
import paintPiePreview from '../previews/paint-pie.webp?url';
import psdAdjustmentPreview from '../previews/psd-adjustment.webp?url';
import psdStyledPreview from '../previews/psd-styled.webp?url';
import spectorPreview from '../previews/spector.webp?url';
import threeRpgPreview from '../previews/three-rpg.webp?url';
import threeSmaaPreview from '../previews/three-smaa.webp?url';
import threeSpritesPreview from '../previews/three-sprites.webp?url';
import threeSvgPreview from '../previews/three-svg.webp?url';
import typegpuCausticsPreview from '../previews/typegpu-caustics.webp?url';
import typegpuCube2Preview from '../previews/typegpu-cube-2.webp?url';
import typegpuInstancingPreview from '../previews/typegpu-instancing.webp?url';
import typegpuUniformsPreview from '../previews/typegpu-uniforms.webp?url';
import webglBlendPreview from '../previews/webgl-blend.webp?url';
import webglInstancedDrawingPreview from '../previews/webgl-instanced-drawing.webp?url';
import webglInstancedPreview from '../previews/webgl-instanced.webp?url';
import webglStateDiagramPreview from '../previews/webgl-state-diagram.webp?url';
import webglTiledPreview from '../previews/webgl-tiled.webp?url';
import brushStrokesArt from './art/brush-strokes.webp?url';
import paintStillLifeArt from './art/paint-still-life.webp?url';
import svgTigerArt from './art/svg-tiger.webp?url';

/**
 * One project on the start page. `art` is an image of what the project makes, without its interface; `previews` are screenshots
 * of the pages inside a folder.
 */
export type Project = {
  href: string;
  name: string;
  /** URL of a Tabler outline icon. */
  icon: string;
  art?: string;
  previews?: string[];
  /** The hub route of a folder; its pages are counted from it. */
  folder?: Routes;
  /** How an opened folder groups its pages; one untitled group of the hub's pages when absent. */
  folderGroups?: FolderGroups;
  /** The workspace directories the project is made of, for telling when it last changed. */
  sources?: string[];
};

/** A titled group of projects, from the most finished to the abandoned, with a line on what that means. */
export type ProjectGroup = {
  id: 'flagship' | 'workshop' | 'learning' | 'archive';
  title: string;
  description: string;
  projects: Project[];
};

/** The pages of a folder project in groups, for opening it in place. */
export function groupsOf(project: Project): FolderGroups {
  return project.folderGroups ?? [{ routes: project.folder?.children ?? [] }];
}

/** The number of pages in a folder project, or `undefined` for a single page. */
export function pagesOf(project: Project) {
  return project.folder ? countPages(project.folder) : undefined;
}

export const catalog: ProjectGroup[] = [
  {
    id: 'flagship',
    title: 'Flagship',
    description: 'finished, maintained, used daily',
    projects: [
      {
        href: String(paintRoutes.path),
        name: 'Paint',
        sources: ['apps/paint', 'packages/paint', 'packages/paint-core'],
        icon: paletteIcon,
        art: paintStillLifeArt,
        previews: [
          paintStillLifeArt,
          paintGlassPreview,
          paintDialPreview,
          paintDeckPreview,
          paintHudPreview,
          paintPiePreview,
          paintDemoFillPreview,
          paintDesktopPreview
        ],
        folder: paintRoutes,
        folderGroups: paintFolderGroups
      },
      {
        href: '/psd-viewer',
        name: 'PSD Viewer',
        sources: ['apps/psd-viewer', 'packages/psd'],
        icon: stackIcon,
        art: psdStyledPreview,
        previews: [psdAdjustmentPreview]
      },
      {
        href: '/solid-svg-editor',
        name: 'Solid SVG Editor',
        sources: ['apps/solid-svg-editor'],
        icon: vectorBezierIcon,
        art: svgTigerArt
      },
      {
        href: '/gpu-text-rendering',
        name: 'GPU Text Rendering',
        sources: ['apps/gpu-text-rendering'],
        icon: typographyIcon,
        art: gpuTextPreview
      },
      {
        href: '/abr-viewer',
        name: 'ABR Viewer',
        sources: ['apps/abr-viewer', 'packages/abr-parser', 'packages/abr-brush', 'packages/abr-paint'],
        icon: brushIcon,
        art: brushStrokesArt
      },
      {
        href: '/card-stack',
        name: 'Card Stack',
        sources: ['packages/card-stack'],
        icon: cardsIcon,
        art: cardStackPreview
      },
      {
        href: '/browser-atlas',
        name: 'Browser Atlas',
        sources: ['apps/browser-atlas'],
        icon: worldIcon
      },
      {
        href: '/solid-virtual',
        name: 'Solid Virtual',
        sources: ['packages/solid-virtual'],
        icon: listDetailsIcon
      }
    ]
  },
  {
    id: 'workshop',
    title: 'Workshop',
    description: 'works, but rough edges',
    projects: [
      {
        href: '/grease-pencil-typegpu',
        name: 'Grease Pencil',
        sources: ['apps/grease-pencil-typegpu'],
        icon: scribbleIcon,
        art: greasePencilPreview
      },
      {
        href: '/night-defense',
        name: 'Night Defense',
        sources: ['apps/night-defense'],
        icon: buildingCastleIcon,
        art: nightDefensePreview
      },
      { href: '/tanki', name: 'Tanki', sources: ['apps/tanki'], icon: tankIcon },
      {
        href: '/spector',
        name: 'Spector',
        sources: ['apps/sketchfab-spector', 'packages/spector'],
        icon: zoomScanIcon,
        art: spectorPreview
      },
      {
        href: '/webgl-state-diagram',
        name: 'WebGL State Diagram',
        sources: ['packages/webgl-state-diagram'],
        icon: schemaIcon,
        art: webglStateDiagramPreview
      },
      {
        href: '/solid-dnd',
        name: 'Solid DnD',
        sources: ['packages/solid-dnd', 'apps/solid-dnd-playground'],
        icon: dragDropIcon
      },
      {
        href: '/dnd-playground',
        name: 'Solid Nest',
        sources: ['packages/solid-nest', 'apps/dnd-playground'],
        icon: binaryTreeIcon
      },
      { href: '/card-stack/notebook', name: 'Notebook', sources: ['apps/folder-tabs'], icon: notebookIcon },
      {
        href: String(uiComponentsRoutes.path),
        name: 'UI / UX',
        sources: ['packages/ui-components-examples', 'packages/ui-components'],
        icon: componentsIcon,
        folder: uiComponentsRoutes
      }
    ]
  },
  {
    id: 'learning',
    title: 'Learning',
    description: 'library tours, one page per idea',
    projects: [
      {
        href: String(webglExamplesRoute.path),
        name: 'WebGL',
        sources: ['packages/webgl-examples'],
        icon: triangleIcon,
        previews: [webglBlendPreview, webglInstancedDrawingPreview, webglInstancedPreview, webglTiledPreview],
        folder: webglExamplesRoute
      },
      {
        href: String(typegpuRoutes.path),
        name: 'TypeGPU',
        sources: ['packages/typegpu-examples'],
        icon: cpuIcon,
        previews: [typegpuCube2Preview, typegpuCausticsPreview, typegpuInstancingPreview, typegpuUniformsPreview],
        folder: typegpuRoutes
      },
      {
        href: String(threeRoutes.path),
        name: 'Three.js',
        sources: ['packages/three-examples'],
        icon: brandThreejsIcon,
        previews: [threeSpritesPreview, threeRpgPreview, threeSmaaPreview, threeSvgPreview],
        folder: threeRoutes
      },
      {
        href: '/solidjs-patterns',
        name: 'SolidJS Patterns',
        sources: ['apps/solidjs-patterns'],
        icon: codeIcon
      },
      {
        href: String(oglRoutes.path),
        name: 'OGL',
        sources: ['packages/ogl-examples'],
        icon: hexagonsIcon,
        folder: oglRoutes
      },
      {
        href: String(phaserRoutes.path),
        name: 'Phaser',
        sources: ['packages/phaser-examples'],
        icon: rocketIcon,
        folder: phaserRoutes
      },
      { href: '/pixijs-examples', name: 'PixiJS', sources: ['packages/pixijs-examples'], icon: sparklesIcon },
      {
        href: String(webgpuRoutes.path),
        name: 'WebGPU',
        sources: ['packages/webgpu-examples'],
        icon: cubeIcon,
        folder: webgpuRoutes
      },
      {
        href: String(wasmRustRoutes.path),
        name: 'WASM',
        sources: ['packages/wasm-rust-pages'],
        icon: brandRustIcon,
        folder: wasmRustRoutes
      },
      {
        href: String(mathRoutes.path),
        name: 'Math',
        sources: ['packages/math-examples'],
        icon: mathFunctionIcon,
        folder: mathRoutes
      },
      {
        href: String(twglRoutes.path),
        name: 'twgl',
        sources: ['packages/twgl-examples'],
        icon: sitemapIcon,
        folder: twglRoutes
      },
      {
        href: '/gsap-scroll-trigger-svg-text-mask',
        name: 'GSAP',
        sources: ['packages/gsap-examples'],
        icon: waveSineIcon
      }
    ]
  },
  {
    id: 'archive',
    title: 'Archive',
    description: 'old experiments, kept for reference',
    projects: [
      { href: '/player', name: 'Player', icon: movieIcon },
      { href: '/web-audio', name: 'Web Audio', icon: waveSineIcon },
      { href: '/3d-wireframe', name: '3D Wireframe', icon: cube3dSphereIcon },
      { href: '/excalibur-examples', name: 'Excalibur', icon: swordIcon },
      { href: '/animations', name: 'Animations', icon: ghostIcon },
      { href: '/ldtk-ts-exampless', name: 'ldtk-ts', icon: deviceGamepadIcon },
      { href: '/webxr-vr-teleport', name: 'WebXR Teleport', icon: cube3dSphereIcon },
      { href: '/gsap-page-scroll-animation', name: 'Page Scroll', icon: waveSineIcon },
      { href: String(escyRoutes.path), name: 'ECSY', icon: topologyIcon, folder: escyRoutes }
    ]
  }
];
