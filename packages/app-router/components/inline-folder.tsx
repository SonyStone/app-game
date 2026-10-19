import { createContext, For, Show, useContext, type Component } from 'solid-js';
import type { Routes } from '../routes.interface';
import styles from './inline-folder.module.css';
import { countPages, Tile, TileGrid, TileGroup, TilePreviews } from './tile-grid';

/**
 * A folder's pages in groups, each with an optional title and a line on what its pages are. Only routes
 * with a `Preview` are listed, as a folder's page count counts them; groups without such routes are skipped.
 */
export type FolderGroups = readonly { title?: string; description?: string; routes: readonly Routes[] }[];

/**
 * The app's start page, which opens folders in place: a folder's own address, `/<folder>`, shows it with
 * that folder open. Hubs render it as their index route through `FolderIndex`. Without a provider a
 * folder's address renders nothing.
 */
export const FolderHost = createContext<Component>(() => null);

/** A hub's index route: the app's start page (see `FolderHost`) with the hub's folder open. */
export function FolderIndex() {
  const Host = useContext(FolderHost);

  return <Host />;
}

/**
 * An opened folder in place, after Windows 10 Mobile live folders: a panel in the folder's colour that the
 * start page shows instead of the folder tile, pushing the tiles after it down. Its colour runs edge to
 * edge of the screen while its tiles keep to the start page's grid. The page owns the open state and the
 * morph; the close button only reports the panel to `onClose`.
 */
export function InlineFolder(props: {
  /** The folder's route path, which its pages are under. */
  path: string;
  title: string;
  /** The folder tile's hue, in OKLCH degrees. */
  hue: number;
  /** Greys the panel and its tiles out, for archived folders. */
  muted?: boolean;
  groups: FolderGroups;
  /** The path of the page the folder closes to, where its tile is. */
  back: string;
  /** Called with the panel, to morph it back into the folder tile. */
  onClose: (panel: HTMLElement) => void;
}) {
  const groups = () => visibleGroups(props.groups);

  return (
    <section
      class={[styles.panel, { [styles.muted]: props.muted }]}
      style={{ '--tile-hue': props.hue }}
      data-folder-panel={props.path}
      data-folder-back={props.back}
    >
      <header class={styles.header}>
        <h2 class={styles.title}>{props.title}</h2>
        <span class={styles.bandCount}>
          {pageCount(groups())} pages · {groups().length} groups
        </span>
        <span class={styles.hatch} />
        <button
          type="button"
          class={styles.close}
          aria-label="Close folder"
          onClick={(event) => props.onClose(event.currentTarget.closest<HTMLElement>('[data-folder-panel]')!)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 15l6 -6l6 6" />
          </svg>
        </button>
      </header>
      <div class={styles.content}>
        <span class={styles.guides} aria-hidden="true" />
        <TileGrid>
          <For each={groups()}>
            {(group) => (
              <section class={styles.section}>
                <Show when={groups().length > 1}>
                  <header class={styles.sectionHead}>
                    <h3 class={styles.sectionTitle}>{group.title}</h3>
                    <Show when={group.description}>
                      <span class={styles.sectionNote}>{group.description}</span>
                    </Show>
                  </header>
                </Show>
                <TileGroup>
                  <For each={group.routes.filter((route) => route.Preview)}>
                    {(route, index) => (
                      <RouteTile
                        route={route}
                        folderPath={props.path}
                        folderTitle={props.title}
                        hue={props.hue + ((index() * 47) % 100) - 50}
                        muted={props.muted}
                      />
                    )}
                  </For>
                </TileGroup>
              </section>
            )}
          </For>
        </TileGrid>
      </div>
    </section>
  );
}

/** Groups that have pages to list. */
function visibleGroups(groups: FolderGroups) {
  return groups.filter((group) => group.routes.some((route) => route.Preview));
}

function pageCount(groups: FolderGroups) {
  return groups.reduce((sum, group) => sum + group.routes.filter((route) => route.Preview).length, 0);
}

/**
 * A page's tile: medium with its screenshot when the app has one, small and plain otherwise. A leading
 * `<folder> · ` in the page name is dropped, as the panel title already says it.
 */
function RouteTile(props: { route: Routes; folderPath: string; folderTitle: string; hue: number; muted?: boolean }) {
  const path = () => `${props.folderPath}${String(props.route.path)}`;
  const previewOf = useContext(TilePreviews);
  const preview = () => previewOf(path());
  const label = () =>
    typeof props.route.name === 'string'
      ? props.route.name.replace(`${props.folderTitle} · `, '')
      : String(props.route.path).replace(/^\//, '');

  return (
    <Tile
      href={path()}
      label={label()}
      size={preview() ? 'medium' : 'small'}
      hue={props.hue}
      images={preview() ? [preview()!] : undefined}
      pages={props.route.children ? countPages(props.route) : undefined}
      muted={props.muted}
    />
  );
}
