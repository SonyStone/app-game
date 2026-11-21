// @vitest-environment jsdom
import { createRoot, flush } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { findPart, type Board, type Panel } from './board';
import { defaultBoard } from './createBoard';
import { createGrid } from './grid';
import { partDefinition, partStretch } from './parts';
import { visiblePanels } from './windows';
import { choiceKey, createWorkspaces, photoshopBoard, procreateBoard, workspaceKey, workspaceList } from './workspaces';

const disposers: (() => void)[] = [];

afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('storage', () => {
  it('makes an existing board the Custom workspace, unchanged and in front', () => {
    const stored = JSON.stringify({ version: 5, board: someBoard, futureField: 1 });
    localStorage.setItem('paint.lego', stored);
    const workspaces = make(() => true);

    expect(workspaces.active()).toBe('custom');
    expect(plain(workspaces.board.board())).toEqual(someBoard);
    expect(localStorage.getItem('paint.lego')).toBe(stored);
    expect(JSON.parse(localStorage.getItem(choiceKey)!)).toEqual({ version: 1, active: 'custom' });

    // Edits to Custom land in the same record, keeping its unknown fields.
    workspaces.board.set({ panels: [] });
    expect(JSON.parse(localStorage.getItem('paint.lego')!)).toMatchObject({ futureField: 1, board: { panels: [] } });
  });

  it.each([
    { coarse: true, first: 'procreate' },
    { coarse: false, first: 'photoshop' }
  ] as const)(
    'starts a new user with a coarse pointer $coarse in $first and keeps that choice',
    ({ coarse, first }) => {
      const workspaces = make(() => coarse);
      expect(workspaces.active()).toBe(first);
      expect(workspaces.board.board()).toBe(first === 'procreate' ? procreateBoard : photoshopBoard);
      expect(JSON.parse(localStorage.getItem(choiceKey)!)).toEqual({ version: 1, active: first });

      // A board stored later does not turn the device into an existing user's.
      localStorage.setItem('paint.lego', JSON.stringify({ version: 5, board: someBoard }));
      expect(make(() => !coarse).active()).toBe(first);
    }
  );

  it('keeps each workspace’s edits apart, across switches and reloads', () => {
    const workspaces = make(() => false);
    const photoshop = withPanel(photoshopBoard, 'mine');
    workspaces.board.set(photoshop);
    workspaces.switchTo('procreate');
    expect(workspaces.board.latest()).toBe(procreateBoard);
    flush();
    expect(workspaces.board.board()).toBe(procreateBoard);
    const procreate = withPanel(procreateBoard, 'other');
    workspaces.board.set(procreate);
    workspaces.switchTo('photoshop');
    flush();
    expect(workspaces.board.board()).toEqual(photoshop);
    expect(workspaces.boardOf('procreate')).toEqual(procreate);
    expect(workspaces.boardOf('custom')).toBe(defaultBoard);
    expect(workspaces.edited('photoshop')).toBe(true);
    expect(workspaces.edited('procreate')).toBe(true);
    expect(localStorage.getItem('paint.lego')).toBeNull();

    const reloaded = make(() => true);
    expect(reloaded.active()).toBe('photoshop');
    expect(plain(reloaded.boardOf('photoshop'))).toEqual(photoshop);
    expect(plain(reloaded.boardOf('procreate'))).toEqual(procreate);
  });

  it('resets a built-in to its original by forgetting its edits, and Custom to the default board', () => {
    localStorage.setItem('paint.lego', JSON.stringify({ version: 5, board: someBoard }));
    const workspaces = make(() => false);
    workspaces.switchTo('procreate');
    workspaces.board.set(withPanel(procreateBoard, 'mine'));
    expect(localStorage.getItem(workspaceKey('procreate'))).not.toBeNull();

    workspaces.reset('procreate');
    flush();
    expect(workspaces.board.board()).toBe(procreateBoard);
    expect(workspaces.edited('procreate')).toBe(false);
    expect(localStorage.getItem(workspaceKey('procreate'))).toBeNull();

    workspaces.reset('custom');
    flush();
    expect(workspaces.boardOf('custom')).toEqual(defaultBoard);
    expect(JSON.parse(localStorage.getItem('paint.lego')!).board).toEqual(defaultBoard);
  });

  it('keeps unknown fields of the choice, and shows Custom for a workspace this version does not know', () => {
    localStorage.setItem(choiceKey, JSON.stringify({ version: 1, active: 'krita', recent: ['krita'] }));
    const workspaces = make(() => true);
    expect(workspaces.active()).toBe('custom');
    expect(JSON.parse(localStorage.getItem(choiceKey)!).active).toBe('krita');

    workspaces.switchTo('procreate');
    expect(JSON.parse(localStorage.getItem(choiceKey)!)).toEqual({
      version: 1,
      active: 'procreate',
      recent: ['krita']
    });
  });

  it('chooses anew over a corrupt choice', () => {
    localStorage.setItem(choiceKey, '{broken');
    expect(make(() => true).active()).toBe('procreate');
    expect(JSON.parse(localStorage.getItem(choiceKey)!)).toEqual({ version: 1, active: 'procreate' });
  });

  it('never overwrites a choice a newer version stored, and reports the switch it cannot keep', () => {
    const stored = JSON.stringify({ version: 2, active: 'photoshop' });
    localStorage.setItem(choiceKey, stored);
    const notice = vi.fn();
    const workspaces = make(() => true, notice);
    expect(workspaces.active()).toBe('photoshop');

    workspaces.switchTo('custom');
    flush();
    expect(workspaces.active()).toBe('custom');
    expect(notice).toHaveBeenCalledWith(expect.stringContaining('workspace'));
    expect(localStorage.getItem(choiceKey)).toBe(stored);
  });

  it('switches in memory and reports when storage refuses the choice', () => {
    const notice = vi.fn();
    const refused = make(() => false, notice);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });

    refused.switchTo('procreate');
    flush();
    expect(refused.active()).toBe('procreate');
    expect(refused.board.board()).toBe(procreateBoard);
    expect(notice).toHaveBeenCalledTimes(1);
  });
});

describe('built-in boards', () => {
  const builtIns = [
    { name: 'Photoshop-like', board: photoshopBoard },
    { name: 'Procreate-like', board: procreateBoard }
  ];

  it.each(builtIns)('$name holds only registered parts, the menu among them, none overlapping', ({ board }) => {
    const parts = board.panels.flatMap((panel) => panel.parts);
    expect(parts.filter((part) => !partDefinition(part.kind)).map((part) => part.kind)).toEqual([]);
    expect(new Set(parts.map((part) => part.id)).size).toBe(parts.length);
    expect(new Set(board.panels.map((panel) => panel.id)).size).toBe(board.panels.length);
    expect(parts.some((part) => part.kind === 'action:options')).toBe(true);

    for (const panel of board.panels) {
      if (panel.owner !== undefined) {
        expect(findPart(board, panel.owner), panel.id).toBeDefined();
      }

      for (const [index, a] of panel.parts.entries()) {
        for (const b of panel.parts.slice(index + 1)) {
          expect(apart(a, b), `${a.id} and ${b.id}`).toBe(true);
        }
      }
    }
  });

  it('are the built-ins the lists offer, Custom being the default board', () => {
    expect(workspaceList.map((workspace) => [workspace.id, workspace.board])).toEqual([
      ['photoshop', photoshopBoard],
      ['procreate', procreateBoard],
      ['custom', defaultBoard]
    ]);
  });

  const views = [
    { width: 1646, height: 909 },
    { width: 909, height: 1646 },
    { width: 1440, height: 900 }
  ];
  const cases = builtIns.flatMap((builtIn) =>
    views.flatMap((view) => [28, 32, 44].map((cell) => ({ ...builtIn, view, cell })))
  );

  it.each(cases)(
    '$name lies inside a $view.width×$view.height view at a $cell px cell, no panel over another',
    ({ board, view, cell }) => {
      const pitch = createGrid(() => cell).pitch();
      const shown = visiblePanels(pitch, board, undefined, false, view, undefined, partStretch);
      expect(shown.map(({ panel }) => panel.id).sort()).toEqual(
        board.panels
          .filter((panel) => panel.owner === undefined)
          .map((panel) => panel.id)
          .sort()
      );
      expectInside(shown, view);

      // Each panel a part opens fits too, over the board as popovers are.
      for (const owner of board.panels.flatMap((panel) => (panel.owner ? [panel.owner] : []))) {
        const opened = visiblePanels(pitch, board, owner, false, view, undefined, partStretch);
        const panel = opened.find((entry) => entry.panel.owner === owner);
        expect(panel, owner).toBeDefined();
        expectInside([panel!], view, false);
      }
    }
  );

  it('docks the Photoshop-like layers in their wide tree look, stretched to the view', () => {
    const pitch = createGrid(() => 28).pitch();
    const view = { width: 1646, height: 909 };
    const shown = visiblePanels(pitch, photoshopBoard, undefined, false, view, undefined, partStretch);
    const panels = shown.find(({ panel }) => panel.id === 'ps-panels')!;
    const layers = panels.panel.parts.find((part) => part.kind === 'layers:strip')!;
    expect(createGrid(() => 28).length(layers.span.columns)).toBeGreaterThanOrEqual(160);
    expect(panels.frame.rect.left + panels.frame.rect.width).toBe(view.width);
    expect(panels.frame.origin.y + (layers.cell.row + layers.span.rows) * pitch).toBeGreaterThan(view.height - pitch);
  });
});

const someBoard: Board = {
  panels: [
    {
      id: 'mine',
      at: { x: 0.5, y: 0.5 },
      parts: [{ id: 'undo', kind: 'action:undo', cell: { column: 0, row: 0 }, span: { columns: 1, rows: 1 } }]
    }
  ]
};

/** Workspaces made under a root disposed after the test. */
function make(coarse: () => boolean, notice?: (message: string) => void) {
  const workspaces = createRoot((dispose) => {
    disposers.push(dispose);
    return createWorkspaces(notice, coarse);
  });
  flush();
  return workspaces;
}

/** `board` with one more panel, an undo button, so the edit is told from the original. */
function withPanel(board: Board, id: string): Board {
  return { ...board, panels: [...board.panels, { ...someBoard.panels[0]!, id }] };
}

/** `board` without the stored-record metadata parts carry once read from storage. */
function plain(board: Board) {
  return JSON.parse(JSON.stringify(board)) as Board;
}

function apart(a: Panel['parts'][number], b: Panel['parts'][number]) {
  return (
    a.cell.column + a.span.columns <= b.cell.column ||
    b.cell.column + b.span.columns <= a.cell.column ||
    a.cell.row + a.span.rows <= b.cell.row ||
    b.cell.row + b.span.rows <= a.cell.row
  );
}

/** Every panel's plate lies inside `view`, and unless `separate` is false also clear of every other one in `shown`. */
function expectInside(
  shown: ReturnType<typeof visiblePanels>,
  view: { width: number; height: number },
  separate = true
) {
  for (const { panel, frame } of shown) {
    const { left, top, width, height } = frame.rect;
    expect(left, panel.id).toBeGreaterThanOrEqual(0);
    expect(top, panel.id).toBeGreaterThanOrEqual(0);
    expect(left + width, panel.id).toBeLessThanOrEqual(view.width);
    expect(top + height, panel.id).toBeLessThanOrEqual(view.height);
  }

  if (!separate) {
    return;
  }

  for (const [index, { panel: a, frame: one }] of shown.entries()) {
    for (const { panel: b, frame: other } of shown.slice(index + 1)) {
      const clear =
        one.rect.left + one.rect.width <= other.rect.left ||
        other.rect.left + other.rect.width <= one.rect.left ||
        one.rect.top + one.rect.height <= other.rect.top ||
        other.rect.top + other.rect.height <= one.rect.top;
      expect(clear, `${a.id} and ${b.id}`).toBe(true);
    }
  }
}
