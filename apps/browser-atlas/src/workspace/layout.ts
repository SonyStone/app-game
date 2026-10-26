import {
  activePanelOf,
  closePanel,
  createDockState,
  type DockDropTarget,
  type DockNode,
  type DockNodeId,
  type DockState,
  findPanelGroup,
  findParentSplit,
  listGroups,
  normalizeDockState,
  openPanel,
  type PanelId
} from 'solid-dock';
import type { ExplorerSourceId } from '../explorer/model';
import { EXPLORER_SOURCES } from '../explorer/model';
import { getExtensionStorage } from '../settings';

/**
 * Browser Atlas workspace: which panels are open, how the dock arranges them, and
 * what every explorer shows. Plain serializable data; the operations below mutate
 * a draft, so they work on a store draft as well as on a plain object.
 */
export type WorkspaceLayout = {
  /** Arrangement of every open panel. */
  dock: DockState;
  /** Open explorer panels by panel id (`explorer-<number>`). */
  explorers: Record<PanelId, ExplorerPanelState>;
  /**
   * Explorer that follows the focused browser window and shows windows revealed
   * from the extension button. Falls back to the first explorer in layout order.
   */
  primary?: PanelId | undefined;
  /** Browser each service panel shows, kept while the panel is closed. */
  services: Partial<Record<ServicePanelKind, BackendKey>>;
};

/** What one explorer panel shows. */
export type ExplorerPanelState = {
  /** Number in the panel's accessible name, `Explorer <number>`; unique among open explorers. */
  number: number;
  backend: BackendKey;
  source: ExplorerSourceId;
};

/**
 * Stable backend identity: `browser` for the primary browser, `browser:<option id>`
 * for additional browsers, `file:<explorer panel id>` for an explorer's own document.
 */
export type BackendKey = string;

/** Key of the primary browser. */
export const PRIMARY_BROWSER_KEY: BackendKey = 'browser';

/** Panels with browser-level data that used to be pop-ups of an explorer. */
export type ServicePanelKind = 'deleted' | 'backups' | 'cloud';

/** Every panel that is not an explorer; its panel id equals its kind. */
export type UtilityPanelId = ServicePanelKind | 'settings';

/** Utility panels; new ones join a group that already holds one of them. */
const UTILITY_PANEL_IDS = ['deleted', 'backups', 'cloud', 'settings'] as const satisfies readonly UtilityPanelId[];

/** Returns the backend key of an explorer's own document. */
export function documentBackendKey(explorerId: PanelId): BackendKey {
  return `file:${explorerId}`;
}

/** Two explorers side by side: the primary browser's Explore and its Bookmarks, as before docking. */
export function createDefaultWorkspaceLayout(): WorkspaceLayout {
  return {
    dock: createDockState({ row: [{ group: ['explorer-1'] }, { group: ['explorer-2'] }] }),
    explorers: {
      'explorer-1': { number: 1, backend: PRIMARY_BROWSER_KEY, source: 'explore' },
      'explorer-2': { number: 2, backend: PRIMARY_BROWSER_KEY, source: 'bookmarks' }
    },
    primary: 'explorer-1',
    services: {}
  };
}

/** The stored primary explorer while it is open, otherwise the first explorer in layout order. */
export function primaryExplorer(layout: WorkspaceLayout): PanelId | undefined {
  const stored = layout.primary;
  return stored !== undefined && layout.explorers[stored] ? stored : explorersInLayoutOrder(layout)[0];
}

/** Explorer panel ids in layout order: depth-first through the dock, tabs left to right. */
function explorersInLayoutOrder(layout: WorkspaceLayout): PanelId[] {
  return listGroups(layout.dock).flatMap((groupId) => {
    const node = layout.dock.nodes[groupId];
    return node?.type === 'group' ? node.panels.filter((panelId) => layout.explorers[panelId] !== undefined) : [];
  });
}

/** Whether a panel is open and is the visible tab of its group. */
export function isPanelVisible(layout: WorkspaceLayout, panelId: PanelId): boolean {
  const node = layout.dock.nodes[findPanelGroup(layout.dock, panelId) ?? ''];
  return node?.type === 'group' && activePanelOf(node) === panelId;
}

/**
 * Opens a new explorer and returns its id. `view` receives the id, so an explorer
 * can open on its own document. The explorer takes the smallest free number, so
 * closing and reopening panels keeps their names short. Without a target it opens
 * to the right of the last explorer in layout order, or on the left of the
 * utility panels when no explorer is open.
 *
 * Joining an existing row or column, the explorer gets the average size of its
 * neighbours, which keep their proportions; the dock's own split would halve the
 * neighbour instead, so repeated New explorer would make ever thinner panels.
 */
export function addExplorer(
  layout: WorkspaceLayout,
  view: (panelId: PanelId) => Pick<ExplorerPanelState, 'backend' | 'source'>,
  target?: DockDropTarget
): PanelId {
  const used = new Set(Object.values(layout.explorers).map((explorer) => explorer.number));
  let number = 1;
  while (used.has(number)) {
    number += 1;
  }

  const panelId = `explorer-${number}`;
  const placement =
    target ??
    besidePanel(layout, explorersInLayoutOrder(layout).at(-1), 'right') ??
    (isEmptyRoot(layout.dock) ? undefined : { type: 'root', edge: 'left' });
  const parentId = placement?.type === 'group' ? findParentSplit(layout.dock, placement.groupId) : undefined;
  const parent = parentId === undefined ? undefined : layout.dock.nodes[parentId];
  const sizesBefore = parent?.type === 'split' ? [...parent.sizes] : undefined;
  layout.explorers[panelId] = { number, ...view(panelId) };
  openPanel(layout.dock, panelId, placement);
  if (parentId !== undefined && sizesBefore) {
    giveAverageShare(layout.dock, parentId, sizesBefore, panelId);
  }
  return panelId;
}

/**
 * Sizes the group of `panelId`, just added to split `splitId`, as the average of
 * the split's previous children and restores their previous weights. Does nothing
 * when the panel went into a new split instead.
 */
function giveAverageShare(dock: DockState, splitId: DockNodeId, sizesBefore: readonly number[], panelId: PanelId) {
  const split = dock.nodes[splitId];
  const groupId = findPanelGroup(dock, panelId);
  const index = split?.type === 'split' && groupId !== undefined ? split.children.indexOf(groupId) : -1;
  if (split?.type !== 'split' || index === -1 || split.children.length !== sizesBefore.length + 1) {
    return;
  }

  const average = sizesBefore.reduce((sum, size) => sum + size, 0) / sizesBefore.length;
  split.sizes = [...sizesBefore.slice(0, index), average, ...sizesBefore.slice(index)];
}

/**
 * Drop target on `edge` of the group holding `panelId`, or `undefined` when the
 * panel is closed (the dock then picks its first group).
 */
export function besidePanel(
  layout: WorkspaceLayout,
  panelId: PanelId | undefined,
  edge: 'left' | 'right' | 'center'
): DockDropTarget | undefined {
  const groupId = panelId === undefined ? undefined : findPanelGroup(layout.dock, panelId);
  return groupId === undefined ? undefined : { type: 'group', groupId, zone: edge };
}

/**
 * Shows a utility panel: an open one becomes its group's visible tab, a closed one
 * joins the group of another open utility panel, or a new column on the right.
 */
export function showUtilityPanel(layout: WorkspaceLayout, panelId: UtilityPanelId): void {
  if (findPanelGroup(layout.dock, panelId) !== undefined) {
    openPanel(layout.dock, panelId);
    return;
  }

  const sibling = UTILITY_PANEL_IDS.find((candidate) => findPanelGroup(layout.dock, candidate) !== undefined);
  const emptyRoot = isEmptyRoot(layout.dock);
  openPanel(
    layout.dock,
    panelId,
    emptyRoot ? undefined : (besidePanel(layout, sibling, 'center') ?? { type: 'root', edge: 'right' })
  );
}

/**
 * Removes a panel. A closed explorer forgets its view and its document: explorers
 * that showed that document return to the primary browser's Explore. When it was
 * the primary explorer, the first remaining explorer in layout order takes over.
 */
export function closeWorkspacePanel(layout: WorkspaceLayout, panelId: PanelId): void {
  const wasPrimary = primaryExplorer(layout) === panelId;
  closePanel(layout.dock, panelId);
  delete layout.explorers[panelId];
  for (const explorer of Object.values(layout.explorers)) {
    if (explorer.backend === documentBackendKey(panelId)) {
      explorer.backend = PRIMARY_BROWSER_KEY;
      explorer.source = 'explore';
    }
  }

  if (wasPrimary) {
    layout.primary = explorersInLayoutOrder(layout)[0];
  }
}

/**
 * Reads a stored layout. Invalid or missing data gives the default layout. An
 * explorer that showed its own document returns to the primary browser's Explore,
 * because documents are not stored; so does one whose browser is no longer offered.
 */
export async function readWorkspaceLayout(knownBrowsers: readonly BackendKey[]): Promise<WorkspaceLayout> {
  try {
    const extensionStorage = getExtensionStorage();
    const stored = extensionStorage
      ? (await extensionStorage.local.get(WORKSPACE_LAYOUT_STORAGE_KEY))[WORKSPACE_LAYOUT_STORAGE_KEY]
      : parseJson(globalThis.localStorage?.getItem(WORKSPACE_LAYOUT_STORAGE_KEY));
    return parseWorkspaceLayout(stored, knownBrowsers) ?? createDefaultWorkspaceLayout();
  } catch {
    return createDefaultWorkspaceLayout();
  }
}

/** Stores a layout in extension storage or, in the localhost mock, in `localStorage`. */
export async function writeWorkspaceLayout(layout: WorkspaceLayout): Promise<void> {
  const stored: StoredWorkspaceLayout = { version: WORKSPACE_LAYOUT_VERSION, ...layout };
  const extensionStorage = getExtensionStorage();
  if (extensionStorage) {
    await extensionStorage.local.set({ [WORKSPACE_LAYOUT_STORAGE_KEY]: stored });
    return;
  }

  globalThis.localStorage?.setItem(WORKSPACE_LAYOUT_STORAGE_KEY, JSON.stringify(stored));
}

/** Storage key of the workspace layout; each Browser Atlas window reads it on start and writes its changes. */
const WORKSPACE_LAYOUT_STORAGE_KEY = 'browserAtlas.layout.v1';

type StoredWorkspaceLayout = WorkspaceLayout & { version: typeof WORKSPACE_LAYOUT_VERSION };

const WORKSPACE_LAYOUT_VERSION = 1;

const EXPLORER_PANEL_ID_PATTERN = /^explorer-[1-9]\d*$/u;

function parseWorkspaceLayout(value: unknown, knownBrowsers: readonly BackendKey[]): WorkspaceLayout | undefined {
  if (!isRecord(value) || value.version !== WORKSPACE_LAYOUT_VERSION) {
    return undefined;
  }

  const dock = parseDockState(value.dock);
  if (!dock) {
    return undefined;
  }

  const explorers: Record<PanelId, ExplorerPanelState> = {};
  if (isRecord(value.explorers)) {
    for (const [panelId, explorer] of Object.entries(value.explorers)) {
      // The id carries the number, so numbers stay unique.
      const parsed = parseExplorer(panelId, explorer, knownBrowsers);
      if (parsed) {
        explorers[panelId] = parsed;
      }
    }
  }

  const layout: WorkspaceLayout = {
    dock,
    explorers,
    services: parseServices(value.services, knownBrowsers),
    ...(typeof value.primary === 'string' ? { primary: value.primary } : {})
  };
  const openPanels = new Set(Object.values(dock.nodes).flatMap((node) => (node.type === 'group' ? node.panels : [])));
  for (const panelId of openPanels) {
    const known = layout.explorers[panelId] !== undefined || (UTILITY_PANEL_IDS as readonly string[]).includes(panelId);
    if (!known) {
      closePanel(layout.dock, panelId);
    }
  }
  for (const panelId of Object.keys(layout.explorers)) {
    if (!openPanels.has(panelId)) {
      delete layout.explorers[panelId];
    }
  }
  return layout;
}

function parseExplorer(
  panelId: string,
  value: unknown,
  knownBrowsers: readonly BackendKey[]
): ExplorerPanelState | undefined {
  if (!isRecord(value) || !EXPLORER_PANEL_ID_PATTERN.test(panelId) || value.number !== Number(panelId.slice(9))) {
    return undefined;
  }

  const source = EXPLORER_SOURCES.find((candidate) => candidate.id === value.source)?.id;
  if (typeof value.backend !== 'string' || !knownBrowsers.includes(value.backend) || !source) {
    return { number: value.number, backend: PRIMARY_BROWSER_KEY, source: 'explore' };
  }

  return { number: value.number, backend: value.backend, source };
}

function parseServices(value: unknown, knownBrowsers: readonly BackendKey[]): WorkspaceLayout['services'] {
  const services: WorkspaceLayout['services'] = {};
  if (!isRecord(value)) {
    return services;
  }

  for (const kind of ['deleted', 'backups', 'cloud'] as const) {
    const backend = value[kind];
    if (typeof backend === 'string' && knownBrowsers.includes(backend)) {
      services[kind] = backend;
    }
  }
  return services;
}

/** Validates node shapes; {@link normalizeDockState} then repairs references and sizes. */
function parseDockState(value: unknown): DockState | undefined {
  if (!isRecord(value) || typeof value.root !== 'string' || !isRecord(value.nodes)) {
    return undefined;
  }

  const nodes: Record<string, DockNode> = {};
  for (const [id, node] of Object.entries(value.nodes)) {
    const parsed = parseDockNode(node);
    if (!parsed) {
      return undefined;
    }
    nodes[id] = parsed;
  }

  const state: DockState = { root: value.root, nodes };
  normalizeDockState(state);
  return state;
}

function parseDockNode(value: unknown): DockNode | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (value.type === 'group' && isStringArray(value.panels)) {
    return {
      type: 'group',
      panels: [...value.panels],
      ...(typeof value.active === 'string' ? { active: value.active } : {})
    };
  }

  if (
    value.type === 'split' &&
    (value.direction === 'row' || value.direction === 'column') &&
    isStringArray(value.children) &&
    Array.isArray(value.sizes) &&
    value.sizes.every((size) => typeof size === 'number')
  ) {
    return { type: 'split', direction: value.direction, children: [...value.children], sizes: [...value.sizes] };
  }

  return undefined;
}

function isEmptyRoot(dock: DockState): boolean {
  const root = dock.nodes[dock.root];
  return root?.type === 'group' && root.panels.length === 0;
}

function parseJson(serialized: string | null | undefined): unknown {
  return serialized ? (JSON.parse(serialized) as unknown) : undefined;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
