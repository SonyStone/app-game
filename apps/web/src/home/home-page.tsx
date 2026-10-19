import {
  findFolderTile,
  InlineFolder,
  navigateMorphing,
  normalizePath,
  revealFolderPanel,
  Tile,
  TileGrid,
  TileGroup,
  type TileSize
} from '@app-game/app-router';
import { Title } from '@solidjs/meta';
import { useLocation, useNavigate } from '@solidjs/router';
import { For, onSettled, Show } from 'solid-js';
import workspaceUpdates from 'virtual:workspace-updates';
import { catalog, groupsOf, pagesOf, type Project } from './catalog';
import styles from './home-page.module.css';

/**
 * The start page, after the Windows 8 Start screen: projects as tiles in groups from the most finished to
 * the archive, a tile's size marking how far along its project is. Plain tiles are graphite and folders blue,
 * the colour of the band; previews are toned in their tile's colour. Pictures only where they show what a
 * project makes; every group but the archive fills whole rows of a 12-column grid, and the archive is greyed
 * out. A folder opens in place, as Windows 10 Mobile live folders did: its tile grows into a panel, and the
 * tiles after it move below the panel. The address is the folder's own, `/<folder>`, where the folder's index
 * route renders this page through `FolderHost`. Each folder opened is a history
 * entry, so Back steps through the folders opened and then closes the last; the close button skips them. The
 * header lists the projects changed last; the background is a print-like blueprint after Swiss posters:
 * column guides under the tiles, dashed section rules with crosshairs, hatching, a band, grain.
 */
export default function HomePage() {
  /** `depth`: how many folder entries this page pushed since the start page, when the chain began there. */
  const location = useLocation<{ depth?: number }>();
  const navigate = useNavigate();
  const projectCount = catalog.flatMap((group) => group.projects).length;
  const opened = () =>
    catalog
      .flatMap((group) => group.projects.map((project) => ({ group, project })))
      .find(({ project }) => project.folder && project.href === normalizePath(location.pathname));

  function open(project: Project, tile: HTMLAnchorElement) {
    const panel = document.querySelector<HTMLElement>('[data-folder-panel]');
    navigateMorphing(
      tile,
      () =>
        navigate(project.href, {
          scroll: false,
          state: { depth: panel ? location.state?.depth && location.state.depth + 1 : 1 }
        }),
      () => document.querySelector<HTMLElement>(`[data-folder-panel="${CSS.escape(project.href)}"]`),
      revealFolderPanel
    );
  }

  // Arriving at a folder's address, by a link or a reload, scrolls to its panel.
  onSettled(() => {
    const panel = document.querySelector<HTMLElement>('[data-folder-panel]');
    if (panel) {
      revealFolderPanel(panel);
    }
  });

  function close(panel: HTMLElement) {
    const depth = location.state?.depth;
    if (depth) {
      // Stepping back over the folders opened animates through the history morph, as Back does.
      history.go(-depth);
      return;
    }

    // A folder reached by its address closes forward, to a new start page entry.
    navigateMorphing(
      panel,
      () => navigate('/', { scroll: false }),
      findFolderTile(panel.dataset.folderPanel ?? ''),
      (tile) => tile.scrollIntoView({ block: 'center' })
    );
  }

  return (
    <>
      <Title>Examples</Title>
      <main class={styles.page}>
        <header class={styles.header}>
          <h1 class={styles.title}>Examples</h1>
          <Show when={recentUpdates.length}>
            <section class={styles.recent} aria-labelledby="recently-updated">
              <h2 id="recently-updated" class={styles.recentTitle}>
                Recently updated
              </h2>
              <ol class={styles.recentList}>
                <For each={recentUpdates}>
                  {(update) => (
                    <li>
                      <a class={styles.recentItem} href={update.project.href}>
                        <span class={styles.recentName}>{update.project.name}</span>
                        <span class={styles.recentSubject}>{update.subject}</span>
                        <span class={styles.leader} />
                        <time datetime={update.date}>{ago(update.date)}</time>
                      </a>
                    </li>
                  )}
                </For>
              </ol>
            </section>
          </Show>
        </header>
        <div class={styles.band}>
          <div class={styles.bandInner}>
            <p class={styles.bandTagline}>Graphics · Painting · Interfaces</p>
            <span class={styles.bandHatch} />
          </div>
        </div>
        <TileGrid>
          <For each={catalog}>
            {(group) => {
              /** The group split around its open folder, whose tile the panel replaces. */
              const split = () => {
                const index = opened()?.group === group ? group.projects.indexOf(opened()!.project) : -1;
                return index < 0
                  ? undefined
                  : {
                      before: group.projects.slice(0, index),
                      folder: group.projects[index],
                      after: group.projects.slice(index + 1)
                    };
              };
              const tiles = (projects: Project[]) => (
                <For each={projects}>
                  {(project) => <ProjectTile project={project} muted={group.id === 'archive'} onOpenFolder={open} />}
                </For>
              );

              return (
                <section id={group.id} class={styles.section}>
                  <header class={styles.sectionHead}>
                    <h2 class={styles.sectionTitle}>{group.title}</h2>
                    <span class={styles.sectionNote}>{group.description}</span>
                  </header>
                  <span class={[styles.cross, styles.crossStart]} />
                  <span class={[styles.cross, styles.crossEnd]} />
                  <Show
                    when={split()}
                    fallback={
                      <TileGroup>
                        {tiles(group.projects)}
                        {/* The archive's last row ends in hatching, so the gap reads as intended. */}
                        {group.id === 'archive' && (
                          <span
                            class={styles.hatchFill}
                            style={{ '--count': group.projects.length }}
                            aria-hidden="true"
                          />
                        )}
                      </TileGroup>
                    }
                  >
                    {(split) => (
                      <>
                        <Show when={split().before.length}>
                          <TileGroup>{tiles(split().before)}</TileGroup>
                        </Show>
                        <InlineFolder
                          path={split().folder.href}
                          title={split().folder.name}
                          hue={accent}
                          muted={group.id === 'archive'}
                          groups={groupsOf(split().folder)}
                          back="/"
                          onClose={close}
                        />
                        <Show when={split().after.length}>
                          <TileGroup>{tiles(split().after)}</TileGroup>
                        </Show>
                      </>
                    )}
                  </Show>
                </section>
              );
            }}
          </For>
        </TileGrid>
        <p class={styles.edge} aria-hidden="true">
          Examples — graphics, painting and interfaces — {projectCount} projects
        </p>
      </main>
    </>
  );
}

/**
 * The four projects changed last, newest first, each with its latest commit across its sources; the
 * archive is left out. Empty when the build had no git history.
 */
const recentUpdates = catalog
  .filter((group) => group.id !== 'archive')
  .flatMap((group) => group.projects)
  .flatMap((project) => {
    const updates = (project.sources ?? []).flatMap((source) => workspaceUpdates[source] ?? []);
    const latest = updates.sort(newestFirst)[0];
    return latest ? [{ project, ...latest }] : [];
  })
  .sort(newestFirst)
  .slice(0, 4);

function newestFirst(a: { date: string }, b: { date: string }) {
  return Date.parse(b.date) - Date.parse(a.date);
}

const relativeTime = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** How long ago `date` was, in days for the last week, then weeks, then months: "yesterday", "3 weeks ago". */
function ago(date: string) {
  const days = Math.round((Date.parse(date) - Date.now()) / 86_400_000);
  if (days > -7) {
    return relativeTime.format(days, 'day');
  }

  if (days > -60) {
    return relativeTime.format(Math.round(days / 7), 'week');
  }

  return relativeTime.format(Math.round(days / 30), 'month');
}

/** Folders and their pages take the band's hue; sizes are chosen so each group fills its rows exactly. */
const accent = 255;

const sizes: Record<string, TileSize> = {
  Paint: 'hero',
  'PSD Viewer': 'wide',
  'Solid SVG Editor': 'wide',
  'GPU Text Rendering': 'wide',
  'ABR Viewer': 'medium',
  'Card Stack': 'medium',
  'Browser Atlas': 'medium',
  'Solid Virtual': 'medium',
  'Grease Pencil': 'wide',
  'Night Defense': 'medium',
  Spector: 'medium',
  'WebGL State Diagram': 'medium',
  WebGL: 'medium',
  TypeGPU: 'medium',
  'Three.js': 'medium',
  'SolidJS Patterns': 'medium'
};

function ProjectTile(props: {
  project: Project;
  muted: boolean;
  onOpenFolder: (project: Project, tile: HTMLAnchorElement) => void;
}) {
  /** A folder's previews as its mini tiles, else the art; nothing for a plain glyph tile. */
  const images = () =>
    props.project.folder && props.project.previews
      ? props.project.previews
      : props.project.art
        ? [props.project.art]
        : undefined;

  return (
    <Tile
      href={props.project.href}
      label={props.project.name}
      size={sizes[props.project.name] ?? 'small'}
      hue={accent}
      icon={props.project.icon}
      images={images()}
      pages={pagesOf(props.project)}
      muted={props.muted}
      onOpenFolder={(tile) => props.onOpenFolder(props.project, tile)}
    />
  );
}
