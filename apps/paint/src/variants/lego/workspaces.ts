import { z } from 'zod';
import { createImmediateSignal } from '../../shared/createImmediateSignal';
import type { Board, Panel, Part } from './board';
import { createBoard, defaultBoard } from './createBoard';
import { swatchPanelParts } from './swatchPanelParts';

/**
 * Workspaces: named boards the user switches between, each kept and edited on its own. Two are built in and look like
 * programs people know, so a first visit shows a familiar layout rather than a pile of parts: Photoshop-like and
 * Procreate-like. The third, Custom, is the user's own board, the one LEGO kept before workspaces existed. Edits to a
 * built-in are kept apart from Custom and from each other, and resetting a built-in brings back its original.
 *
 * Every built-in includes the Options part (`action:options`), the way into Parts & Options and so to the other
 * workspaces; nothing on the board is permanent, and a Back with nothing open opens that menu as well.
 */
export function createWorkspaces(
  onSavingError?: (message: string) => void,
  /** Whether the device's primary pointer is coarse, which picks a new user's first workspace. */
  coarse: () => boolean = coarsePointer
) {
  const choice = readChoice(coarse);
  const boards = Object.fromEntries(
    workspaceList.map((workspace) => [
      workspace.id,
      workspace.id === 'custom'
        ? createBoard(onSavingError)
        : createBoard(onSavingError, { key: workspaceKey(workspace.id), original: workspace.board, builtIn: true })
    ])
  ) as Record<WorkspaceId, ReturnType<typeof createBoard>>;
  const [active, setActive, activeNow] = createImmediateSignal<WorkspaceId>(choice.active);
  let envelope = choice.envelope;

  if (choice.fresh) {
    // The first choice is kept at once, so a later stored board cannot change which workspace counts as the start.
    writeChoice(envelope, choice.active);
  }

  return {
    /** The workspaces in the order they are offered. */
    list: workspaceList,
    /** The workspace the board shows. */
    active,
    /**
     * The board the editor shows and edits: the active workspace's. `latest`, `set` and `reset` follow a switch made
     * earlier in the same event.
     */
    board: {
      board: () => boards[active()].board(),
      latest: () => boards[activeNow()].latest(),
      set: (next: Board) => boards[activeNow()].set(next),
      reset: () => boards[activeNow()].reset()
    } satisfies BoardStore,
    /** Workspace `id`'s board as it is now, edits included. */
    boardOf: (id: WorkspaceId) => boards[id].board(),
    /** Whether the user's edits to workspace `id` are stored on the device. */
    edited: (id: WorkspaceId) => boards[id].edited(),
    /**
     * Shows workspace `id` and keeps the choice on the device. A refused write keeps the choice until the page closes
     * and reports through `onSavingError`.
     */
    switchTo(id: WorkspaceId) {
      if (id === activeNow()) {
        return;
      }

      setActive(id);
      if (!choice.writable || !writeChoice(envelope, id)) {
        onSavingError?.(choiceMessage);
        return;
      }

      envelope = { ...envelope, version: choiceVersion, active: id };
    },
    /** Restores workspace `id`'s original board: a built-in's as shipped, Custom's as a first visit had it. */
    reset: (id: WorkspaceId) => boards[id].reset()
  };
}

/** What the editor reads and writes of a board: its signal, the last write within an event, and its commands. */
export type BoardStore = {
  board: () => Board;
  latest: () => Board;
  set: (next: Board) => void;
  reset: () => void;
};

/** The workspaces as `createWorkspaces` makes them. */
export type Workspaces = ReturnType<typeof createWorkspaces>;

/**
 * What the lists of workspaces and the Workspace part use: the workspaces and their commands, with `switchTo` as the
 * editor wraps it (closing what is open over the board first), and the view's size the miniatures are drawn for.
 */
export type WorkspaceControls = Pick<Workspaces, 'list' | 'active' | 'boardOf' | 'edited' | 'switchTo' | 'reset'> & {
  view: () => { width: number; height: number };
};

/**
 * Photoshop's layout at the reference cells: the tools in a column docked to the left edge (move, lasso, the brush,
 * the eraser, the fill, and the local undo where Photoshop has its History Brush); along the top the options strip, starting with the menu and then the brush's own options as
 * Photoshop's options bar has them (the brush library, Brush settings, then size and opacity as numbers that a drag
 * scrubs, as Photoshop's fields are) with undo and redo; the view's
 * zoom, rotation and full screen at the bottom left, where Photoshop shows the zoom; and on the right edge, docked, the
 * color (fore/back, hex and a picker) over the layers in their wide tree look, which take every row left. The right
 * column is six cells wide, so the tree has its 160 px from a 24 px cell up. Free panels lie at fractions of the view's
 * corners, so they keep their corners as the view turns; the top strip has room between the docked columns of an
 * upright 909 px tablet at a 44 px cell.
 */
export const photoshopBoard: Board = {
  panels: [
    {
      id: 'ps-tools',
      at: { x: 0, y: 0 },
      dock: 'left',
      parts: [
        part('ps-move', 'action:transform', 0, 0),
        part('ps-lasso', 'action:lasso', 0, 1),
        part('ps-brush', 'preset:builtin:soft-round', 0, 2),
        part('ps-eraser', 'action:eraser', 0, 3),
        part('ps-fill', 'action:fill', 0, 4),
        part('ps-history', 'action:local-undo', 0, 5)
      ]
    },
    {
      id: 'ps-options',
      at: { x: 0, y: 0 },
      parts: [
        part('ps-menu', 'action:options', 0, 0),
        part('ps-brushes', 'action:brushes', 1, 0),
        part('ps-brush-settings', 'action:brush-editor', 2, 0),
        { ...part('ps-size', 'value:size', 3, 0, 3), looks: { '3x1': 'number' } },
        { ...part('ps-opacity', 'value:opacity', 6, 0, 3), looks: { '3x1': 'number' } },
        part('ps-undo', 'action:undo', 9, 0),
        part('ps-redo', 'action:redo', 10, 0)
      ]
    },
    {
      id: 'ps-view',
      at: { x: 0, y: 1 },
      parts: [
        part('ps-zoom', 'action:zoom', 0, 0, 2),
        part('ps-rotation', 'action:rotation', 2, 0, 2),
        part('ps-fullscreen', 'action:fullscreen', 4, 0)
      ]
    },
    {
      id: 'ps-panels',
      at: { x: 1, y: 0 },
      dock: 'right',
      parts: [
        part('ps-colors', 'color:pair', 0, 0, 2),
        part('ps-hex', 'color:hex', 2, 0, 4),
        part('ps-picker', 'color:wheel', 0, 1, 6, 6),
        part('ps-layers', 'layers:strip', 0, 7, 6, 8)
      ]
    }
  ]
};

/**
 * Where Procreate-like's six-cell-wide popovers lie from their one-cell button in the top bar: under the bar, a cell's
 * gap below it, their right edge under the button's. Declared before the board that reads it as it is made.
 */
const dropDown = { column: -5, row: 2 };

/**
 * Procreate's layout: a slim bar across the top, at its left the menu, the selection and transform tools and undo and
 * redo, at its right the brush library, the eraser, the layers button and the color swatch, as Procreate orders them;
 * and on the left edge the size slider over the opacity slider, as Procreate's sidebar. Nothing else lies on the
 * canvas: the layers button opens the layers in their wide tree look, and the swatch the pickers, each dropping down
 * under the bar with its right edge under the button, as Procreate's popovers do.
 */
export const procreateBoard: Board = {
  panels: [
    {
      id: 'pc-actions',
      at: { x: 0, y: 0 },
      parts: [
        part('pc-menu', 'action:options', 0, 0),
        part('pc-lasso', 'action:lasso', 1, 0),
        part('pc-transform', 'action:transform', 2, 0),
        part('pc-undo', 'action:undo', 3, 0),
        part('pc-redo', 'action:redo', 4, 0)
      ]
    },
    {
      id: 'pc-tools',
      at: { x: 1, y: 0 },
      parts: [
        part('pc-brushes', 'action:brushes', 0, 0),
        part('pc-eraser', 'action:eraser', 1, 0),
        part('pc-layers', 'layers:opener', 2, 0),
        part('pc-color', 'color:swatch', 3, 0)
      ]
    },
    {
      id: 'pc-sliders',
      at: { x: 0, y: 0.22 },
      parts: [part('pc-size', 'value:size', 0, 0, 1, 6), part('pc-opacity', 'value:opacity', 0, 6, 1, 6)]
    },
    ownedPanel('pc-layers', [part('strip', 'layers:strip', 0, 0, 6, 12)], dropDown),
    ownedPanel('pc-color', swatchPanelParts, dropDown)
  ]
};

/** The workspaces in the order the lists offer them; `short` is the name where the full one does not fit. */
export const workspaceList = [
  { id: 'photoshop', name: 'Photoshop-like', short: 'Photoshop', board: photoshopBoard },
  { id: 'procreate', name: 'Procreate-like', short: 'Procreate', board: procreateBoard },
  { id: 'custom', name: 'Custom', short: 'Custom', board: defaultBoard }
] as const satisfies readonly { id: string; name: string; short: string; board: Board }[];

/** A workspace's identifier, as stored in the choice. */
export type WorkspaceId = (typeof workspaceList)[number]['id'];

/** The `localStorage` key a built-in workspace's edits are kept under; Custom keeps the board's own `paint.lego`. */
export function workspaceKey(id: Exclude<WorkspaceId, 'custom'>) {
  return `paint.lego.workspace.${id}`;
}

/** The key the active workspace is kept under, as `{ version, active }` plus any fields a later version adds. */
export const choiceKey = 'paint.lego.workspaces';

/** Whether the device's primary pointer is a finger, as on a tablet or phone; false where it cannot be told. */
export function coarsePointer() {
  try {
    return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

const choiceVersion = 1;
const choiceMessage = "The workspace choice can't be saved on this device.";

/**
 * The stored choice. Without one, a device that already keeps a board (`paint.lego`) is an existing user's: their
 * board is Custom and stays in front. A new user starts in Procreate-like on a touch device and in Photoshop-like
 * otherwise. A corrupt choice is made anew; a choice a newer version stored is read but never overwritten, and one it
 * names that this version does not know shows Custom.
 */
function readChoice(coarse: () => boolean) {
  let raw: string | null;
  try {
    raw = localStorage.getItem(choiceKey);
  } catch {
    return { active: firstWorkspace(coarse), envelope: {}, writable: false, fresh: false };
  }

  if (raw !== null) {
    const parsed = storedChoice.safeParse(safeJson(raw));
    if (parsed.success) {
      const { active } = parsed.data;
      const known = workspaceList.find((workspace) => workspace.id === active)?.id;
      return {
        active: known ?? 'custom',
        envelope: parsed.data as Record<string, unknown>,
        writable: (parsed.data.version ?? choiceVersion) <= choiceVersion,
        fresh: false
      };
    }
  }

  let existing = false;
  try {
    existing = localStorage.getItem('paint.lego') !== null;
  } catch {
    // Unreadable storage keeps no board either.
  }

  return { active: existing ? 'custom' : firstWorkspace(coarse), envelope: {}, writable: true, fresh: true } as const;
}

/** A new user's first workspace by the device's pointer. */
function firstWorkspace(coarse: () => boolean): WorkspaceId {
  return coarse() ? 'procreate' : 'photoshop';
}

const storedChoice = z.looseObject({ version: z.number().int().min(1).optional(), active: z.string() });

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Keeps `active` with the stored record's other fields; false when storage refused it. */
function writeChoice(envelope: Record<string, unknown>, active: WorkspaceId) {
  try {
    localStorage.setItem(choiceKey, JSON.stringify({ ...envelope, version: choiceVersion, active }));
    return true;
  } catch {
    return false;
  }
}

/** A part of a built-in board, one cell unless `columns` and `rows` say more. */
function part(id: string, kind: string, column: number, row: number, columns = 1, rows = 1): Part {
  return { id, kind, cell: { column, row }, span: { columns, rows } };
}

/** The panel part `owner` opens at `offset` from it, its part ids prefixed with the owner's to keep them unique. */
function ownedPanel(owner: string, parts: readonly Part[], offset?: Panel['offset']): Panel {
  return {
    id: `${owner}-panel`,
    at: { x: 0, y: 0 },
    owner,
    ...(offset && { offset }),
    parts: parts.map((child) => ({ ...child, id: `${owner}-${child.id}` }))
  };
}
