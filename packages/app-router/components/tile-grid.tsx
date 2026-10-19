import { createMediaQuery } from '@solid-primitives/media';
import { createTimeoutLoop } from '@solid-primitives/timer';
import { useHref, useResolvedPath } from '@solidjs/router';
import type { JSX } from '@solidjs/web';
import { createContext, createSignal, For, Show } from 'solid-js';
import type { Routes } from '../routes.interface';
import { isPlainClick } from './folder-transition';
import styles from './tile-grid.module.css';

/**
 * A vertically scrolling page of live-tile groups, after the Windows 8 Start screen.
 *
 * The grid measures in small-tile cells with a gap of one seventh of a cell (Metro's 70 px tiles and
 * 10 px gutters). It shows 4 cells per row on phones, 8 on portrait tablets, 12 on landscape tablets
 * and 16 on wide desktops, so a wide or large tile always fits. Tiles are flat colour with square corners.
 * Custom properties on any ancestor restyle the tiles inside: `--tile-fill` colours every plain tile alike,
 * and `--tile-duotone: on` prints previews in two inks, `--tile-ink` and `--tile-paper`, until hovered.
 */
export function TileGrid(props: { children: JSX.Element }) {
  return <div class={styles.grid}>{props.children}</div>;
}

/** A group of tiles on the grid's columns; tiles pack densely in reading order. */
export function TileGroup(props: { children: JSX.Element }) {
  return (
    <div class={styles.group}>
      <div class={styles.tiles}>{props.children}</div>
    </div>
  );
}

/**
 * The footprint of a tile in grid cells: small 1×1, medium 2×2, wide 4×2, large 4×4, hero 8×4 (4×4 on
 * phones). Larger tiles mark larger, more finished projects.
 */
export type TileSize = 'small' | 'medium' | 'wide' | 'large' | 'hero';

/**
 * A link tile: a flat colour field with a centred glyph and the label at the bottom left. Pressing tilts
 * the tile towards the pointer, as Metro tiles did. With `images` the preview replaces the glyph; several
 * images make the tile live: every few seconds the next one slides up from the bottom, each tile at its
 * own pace, unless reduced motion is requested. With `pages` the tile is a folder, after Windows 10 Mobile
 * tile folders and iPadOS folders: a 2×2 grid of mini tiles fills it, the label and page count float over
 * them on a frosted tag, and `onOpenFolder` opens it in place (see `InlineFolder`).
 */
export function Tile(props: {
  /** Route path, resolved like a router link. */
  href: string;
  label: string;
  /** Defaults to `small`. */
  size?: TileSize;
  /** Hue in OKLCH degrees; all tiles share lightness and chroma so any hues sit well together. */
  hue: number;
  /** URL of a monochrome SVG icon, drawn as a mask in the tile's text colour. */
  icon?: string;
  /** URLs of preview images, shown instead of the icon; several make the tile live. */
  images?: string[];
  /**
   * The number of pages inside; makes the tile a folder. Its mini tiles show the first four `images`,
   * or the icon and three blank tiles in neighbouring hues.
   */
  pages?: number;
  /** Greys the tile out, for archived projects. */
  muted?: boolean;
  /**
   * Opens the folder in place instead of following the link; called with the tile to morph from. Only
   * for folders; modified clicks still open the folder's address in a new tab.
   */
  onOpenFolder?: (tile: HTMLAnchorElement) => void;
}) {
  const resolvedPath = useResolvedPath(() => props.href);
  const href = useHref(resolvedPath);
  const [tilt, setTilt] = createSignal<{ x: number; y: number }>();
  const slides = createSlideshow(() => props.images?.length ?? 0);

  /** Tilts away from the pressed point; a press near the centre only sinks the tile. */
  function press(event: PointerEvent & { currentTarget: HTMLAnchorElement }) {
    const rect = event.currentTarget.getBoundingClientRect();
    setTilt({
      x: (event.clientX - rect.left) / rect.width - 0.5,
      y: (event.clientY - rect.top) / rect.height - 0.5
    });
  }

  function release() {
    setTilt(undefined);
  }

  function openFolder(event: MouseEvent & { currentTarget: HTMLAnchorElement }) {
    if (!props.onOpenFolder || props.pages === undefined || !isPlainClick(event)) {
      return;
    }

    event.preventDefault();
    props.onOpenFolder(event.currentTarget);
  }

  return (
    <a
      class={[styles.tile, styles[props.size ?? 'small'], { [styles.muted]: props.muted, [styles.pressed]: !!tilt() }]}
      href={href()}
      data-folder={props.pages === undefined ? undefined : resolvedPath()}
      aria-label={props.pages === undefined ? props.label : `${props.label}, folder of ${props.pages} pages`}
      style={{
        '--tile-hue': props.hue,
        '--tilt-x': `${-(tilt()?.y ?? 0) * 14}deg`,
        '--tilt-y': `${(tilt()?.x ?? 0) * 14}deg`
      }}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      onClick={openFolder}
    >
      <Show
        when={props.pages === undefined}
        fallback={
          <Folder icon={props.icon} images={props.images} wide={props.size === 'wide' || props.size === 'hero'} />
        }
      >
        <Show when={props.images?.length} fallback={<Glyph icon={props.icon} />}>
          <div class={styles.slides}>
            <For each={props.images}>
              {(image, index) => (
                <img
                  class={[
                    styles.slide,
                    {
                      [styles.current]: index() === slides().current,
                      [styles.arriving]: index() === slides().current && slides().previous !== undefined,
                      [styles.leaving]: index() === slides().previous
                    }
                  ]}
                  src={image}
                  alt=""
                  loading="lazy"
                />
              )}
            </For>
          </div>
        </Show>
      </Show>
      <span class={styles.label}>
        <span class={styles.name}>{props.label}</span>
        <Show when={props.pages !== undefined}>
          <span class={styles.count}>{props.pages}</span>
        </Show>
      </span>
    </a>
  );
}

function Glyph(props: { icon?: string }) {
  return (
    <div class={styles.face}>
      <Show when={props.icon}>{(icon) => <span class={styles.icon} style={{ '--icon': `url("${icon()}")` }} />}</Show>
    </div>
  );
}

/**
 * A folder's face: square mini tiles, 2×2 or 4×2 in a `wide` folder, previews where there are images; a
 * single image fills the grid.
 */
function Folder(props: { icon?: string; images?: string[]; wide?: boolean }) {
  const capacity = () => (props.wide ? 8 : 4);
  const minis = () =>
    props.images?.length ? props.images.slice(0, capacity()) : Array.from({ length: capacity() }, () => undefined);

  return (
    <div class={styles.folder}>
      <For each={minis()} keyed={false}>
        {(image, index) => (
          <span class={[styles.mini, { [styles.whole]: minis().length === 1 }]} style={{ '--mini-index': index }}>
            <Show when={image()} fallback={index === 0 && <Glyph icon={props.icon} />}>
              {(image) => <img src={image()} alt="" loading="lazy" />}
            </Show>
          </span>
        )}
      </For>
    </div>
  );
}

/**
 * Steps through `count` slides at a random pace of 5–9 s, so neighbouring tiles do not flip together.
 * Holds still for a single slide or when the user prefers reduced motion.
 */
function createSlideshow(count: () => number) {
  const reducedMotion = createMediaQuery('(prefers-reduced-motion: reduce)');
  const period = 5000 + Math.random() * 4000;
  const [slides, setSlides] = createSignal<{ current: number; previous?: number }>({ current: 0 });

  createTimeoutLoop(
    () => setSlides((slides) => ({ current: (slides.current + 1) % count(), previous: slides.current })),
    () => count() > 1 && !reducedMotion() && period
  );

  return slides;
}

/**
 * Looks up a preview image URL by a page's resolved path, for tiles that are generated from routes
 * (see `InlineFolder`); provided by the app, which knows where its screenshots live. Without a provider
 * no page has a preview.
 */
export const TilePreviews = createContext<(path: string) => string | undefined>(() => undefined);

/** The number of linked pages directly inside a hub route: its children that render a preview. */
export function countPages(route: Routes) {
  return route.children?.filter((child) => child.Preview).length ?? 0;
}
