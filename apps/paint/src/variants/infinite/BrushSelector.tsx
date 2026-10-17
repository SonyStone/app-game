import { createSignal, For, Show, untrack } from 'solid-js';
import type { BrushPreset } from '../../features/brush-library';
import { brushSets, setOf, type BrushSet } from '../desktop/brushSets';
import { StrokePreview } from '../procreate/StrokePreview';
import styles from './BrushSelector.module.css';
import { InfiniteIcon, type InfiniteIconName } from './icons';
import theme from './theme.module.css';

/**
 * Infinite Painter's brush selector: a tall floating card with the brush folders down the left, each an icon over a
 * small name, and the open folder's brushes on the right as large grey sample strokes with the name small at the
 * bottom right. The current brush stays pinned above the list while other folders are browsed, and its card in the
 * list is the light one. Choosing a brush calls `onChoose` and leaves the card open; choosing a folder only browses.
 *
 * Paint has no brush folders of its own: the folders are the Desktop variant's brush sets (Recent, Basic, Imported,
 * My brushes), plus Favorites when `onFavorite` is given. The card opens on `initialFolder`, or on the folder holding
 * the current brush, and then stays where the user browses. The header's left button narrows the folder column to
 * its icons; Infinite Painter's per-brush options menu (rename, duplicate, share, reset, remove) is left out, as
 * Paint's other panels own those commands.
 */
export function BrushSelector(props: {
  presets: readonly BrushPreset[];
  /** Recently used preset ids, newest first, for the Recent folder. */
  recent: readonly string[];
  /** The id of the preset the tool paints with. */
  preset: string;
  /** Brushes cannot be chosen now, for example during a preset upload. */
  disabled?: boolean;
  /** Favorite preset ids, newest first, for the Favorites folder; see `createBrushFavorites`. */
  favorites?: readonly string[];
  /** Marks or unmarks a preset as a favorite (the pinned card's heart); omitted, Favorites and the heart are hidden. */
  onFavorite?: (id: string) => void;
  /** The folder to open on; the one holding the current brush by default. Read once, at creation. */
  initialFolder?: BrushFolder['id'];
  onChoose: (id: string) => void;
  /** Creates or imports brushes: opens Paint's ABR importer. Omitted, the `+` button is hidden. */
  onImport?: () => void;
  /** Opens the current brush's settings. Omitted, the settings button is hidden. */
  onEdit?: () => void;
}) {
  const folders = () =>
    brushFolders(props.presets, props.recent, props.onFavorite ? (props.favorites ?? []) : undefined);
  const [chosen, setChosen] = createSignal<BrushFolder['id']>(
    untrack(() => props.initialFolder ?? setOf(brushSets(props.presets, props.recent), props.preset))
  );
  const shown = () => folders().find((folder) => folder.id === chosen()) ?? folders()[0];
  const current = () => props.presets.find((preset) => preset.id === props.preset);
  const [compact, setCompact] = createSignal(false);

  return (
    <div class={[theme.panel, styles.selector]} data-compact={compact() ? '' : undefined}>
      <header class={styles.header}>
        <button
          class={theme.iconButton}
          aria-label="Folder icons only"
          aria-pressed={compact() ? 'true' : 'false'}
          onClick={() => setCompact((value) => !value)}
        >
          <InfiniteIcon name="folders" size={20} />
        </button>
        <span class={styles.spacer} />
        <Show when={props.onImport}>
          {(onImport) => (
            <button
              class={theme.iconButton}
              aria-label="Import brushes"
              title="Import ABR brushes"
              disabled={props.disabled}
              onClick={() => onImport()()}
            >
              <InfiniteIcon name="plus" size={20} />
            </button>
          )}
        </Show>
        <Show when={props.onEdit}>
          {(onEdit) => (
            <button class={theme.iconButton} aria-label="Edit brush" title="Edit brush" onClick={() => onEdit()()}>
              <InfiniteIcon name="brushSettings" size={20} />
            </button>
          )}
        </Show>
      </header>
      <div class={styles.columns}>
        <nav class={styles.folders} aria-label="Brush folders">
          <For each={folders()} keyed={(folder) => folder.id}>
            {(folder) => (
              <button
                class={styles.folder}
                aria-pressed={shown()?.id === folder().id ? 'true' : 'false'}
                aria-label={folder().name}
                title={folder().name}
                onClick={() => setChosen(folder().id)}
              >
                <span class={styles.folderIcon}>
                  <InfiniteIcon name={folder().icon} size={18} />
                </span>
                <span class={styles.folderName}>{folder().name}</span>
              </button>
            )}
          </For>
        </nav>
        <div class={styles.brushes}>
          <Show when={current()}>
            {(preset) => (
              <div class={styles.pinned} aria-label="Current brush">
                <StrokePreview settings={preset().settings} height={strokeHeight} color={strokeColor} />
                <span class={styles.name}>{preset().name}</span>
                <Show when={props.onFavorite}>
                  {(onFavorite) => (
                    <button
                      class={styles.heart}
                      aria-label="Favorite"
                      aria-pressed={props.favorites?.includes(preset().id) ? 'true' : 'false'}
                      onClick={() => onFavorite()(preset().id)}
                    >
                      <InfiniteIcon name="heart" size={16} />
                    </button>
                  )}
                </Show>
              </div>
            )}
          </Show>
          <div class={styles.list} role="listbox" aria-label={`${shown()?.name ?? ''} brushes`}>
            <For each={shown()?.presets ?? []} keyed={(preset) => preset.id}>
              {(preset) => (
                <button
                  class={styles.brush}
                  role="option"
                  aria-selected={preset().id === props.preset ? 'true' : 'false'}
                  aria-label={preset().name}
                  disabled={props.disabled}
                  onClick={() => props.onChoose(preset().id)}
                >
                  <StrokePreview
                    settings={preset().settings}
                    height={strokeHeight}
                    color={preset().id === props.preset ? strokeOnLight : strokeColor}
                  />
                  <span class={styles.name}>{preset().name}</span>
                </button>
              )}
            </For>
            <Show when={shown()?.id === 'favorites' && shown()?.presets.length === 0}>
              <p class={styles.empty}>Tap the heart of the current brush to list it here.</p>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
}

/** One folder of the selector's left column: a Desktop brush set, or Favorites. */
export type BrushFolder = {
  id: BrushSet['id'] | 'favorites';
  name: string;
  icon: InfiniteIconName;
  presets: BrushPreset[];
};

/**
 * The selector's folders: the Desktop variant's brush sets in their order, with Favorites after Recent when
 * `favorites` is given; Favorites is listed even when empty, as in Infinite Painter, so the user finds where hearts go.
 */
function brushFolders(
  presets: readonly BrushPreset[],
  recent: readonly string[],
  favorites: readonly string[] | undefined
): BrushFolder[] {
  const folders: BrushFolder[] = brushSets(presets, recent).map((set) => ({ ...set, icon: folderIcons[set.id] }));
  if (favorites) {
    const byId = new Map(presets.map((preset) => [preset.id, preset]));
    const favorite: BrushFolder = {
      id: 'favorites',
      name: 'Favorites',
      icon: 'heart',
      presets: favorites.flatMap((id) => byId.get(id) ?? [])
    };
    folders.splice(folders[0]?.id === 'recent' ? 1 : 0, 0, favorite);
  }

  return folders;
}

const folderIcons: Record<BrushSet['id'], InfiniteIconName> = {
  recent: 'recent',
  basic: 'brush',
  imported: 'download',
  mine: 'open'
};

/** CSS height of a sample stroke. */
const strokeHeight = 46;
/** Infinite Painter draws its sample strokes light grey on the dark cards… */
const strokeColor = '#bdbdc0';
/** …and dark on the light card of the current brush. */
const strokeOnLight = '#3a3a3d';
