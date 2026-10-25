import {
  cellGap,
  findPart,
  frameAt,
  ownedFrame,
  ownedPanel,
  panelFrame,
  pitch,
  type Board,
  type Panel,
  type Point
} from './board';

/**
 * The panels of `board` on screen, in paint order, with where each lies: free panels including windows, then the open
 * swatch's panel and the panels of the swatches it lies in, outermost first. While editing, an open swatch without
 * a panel shows an empty one to drop parts into. The panels in `pinned` keep cell (0, 0) at their pinned origin.
 * The workbench lies in the box instead (see `benchFrame`): given as `bench`, the panels are it and the open chain
 * of a swatch on it, in its pixels within a `view` its size.
 * Windows are free panels in every mode. A collapsed window hides its parts and any open folders within them.
 */
export function visiblePanels(
  board: Board,
  open: string | undefined,
  editing: boolean,
  view: { width: number; height: number },
  pinned?: ReadonlyMap<string, Point>,
  bench?: { panel: Panel; frame: ReturnType<typeof panelFrame> }
) {
  // An open chain shows where its outermost swatch lies: on the board, or on the workbench.
  const chain = [...openChain(board, open)].reverse();
  const host = chain.length > 0 ? findPart(board, chain[0]!)?.panel : undefined;
  const onBench = host ? onWorkbench(board, host) : false;
  const owned = (onBench === (bench !== undefined) ? chain : [])
    .map(
      (owner) =>
        ownedPanel(board, owner) ??
        (editing ? { id: `${owner}-panel`, owner, at: { x: 0, y: 0 }, parts: [] } : undefined)
    )
    .filter((panel): panel is Panel => panel !== undefined);
  const roots = bench ? [bench.panel] : board.panels.filter((panel) => panel.owner === undefined && !panel.bench);
  const candidates = [...roots, ...owned];
  const candidateIds = new Set(candidates.map((panel) => panel.id));
  const available = (panel: Panel, seen = new Set<string>()): boolean => {
    if (!candidateIds.has(panel.id) || seen.has(panel.id)) {
      return false;
    }

    if (panel.owner === undefined || panel.bench) {
      return true;
    }

    seen.add(panel.id);
    const host = findPart(board, panel.owner)?.panel;
    return !!host && !host.window?.collapsed && available(host, seen);
  };
  const panels = candidates.filter((panel) => available(panel));

  const frames = new Map<string, ReturnType<typeof panelFrame>>(bench ? [[bench.panel.id, bench.frame]] : []);
  const frameOf = (panel: Panel, depth = 0): ReturnType<typeof panelFrame> => {
    const known = frames.get(panel.id);
    if (known) {
      return known;
    }

    const host = board.panels.find((other) => other.parts.some((part) => part.id === panel.owner));
    const anchor = host?.parts.find((part) => part.id === panel.owner);
    const pin = pinned?.get(panel.id);
    let frame = pin ? frameAt(panel, pin) : panelFrame(panel, view);
    if (!pin && host && anchor && depth < 8) {
      const { origin } = frameOf(host, depth + 1);
      const at = { x: origin.x + anchor.cell.column * pitch, y: origin.y + anchor.cell.row * pitch };
      // Where the user put it from its swatch, kept in view; otherwise beside the swatch where there is room.
      frame = panel.offset
        ? keptInView(
            frameAt(panel, { x: at.x + panel.offset.column * pitch, y: at.y + panel.offset.row * pitch }),
            view
          )
        : ownedFrame(
            panel,
            {
              left: at.x,
              top: at.y,
              width: anchor.span.columns * pitch - cellGap,
              height: anchor.span.rows * pitch - cellGap
            },
            view
          );
    }

    frames.set(panel.id, frame);
    return frame;
  };

  return panels.map((panel) => ({ panel, frame: frameOf(panel) }));
}

/** Refuses drops into any carried part's descendants, including blocks and malformed existing owner cycles. */
export function canDropParts(board: Board, panel: Panel, carried: ReadonlySet<string>) {
  const seen = new Set<string>();
  let current: Panel | undefined = panel;
  while (current?.owner !== undefined) {
    if (carried.has(current.owner) || seen.has(current.id)) {
      return false;
    }

    seen.add(current.id);
    current = findPart(board, current.owner)?.panel;
  }

  return true;
}

/** `frame` moved the least it takes to lie inside `view`, as far as it fits. */
function keptInView(frame: ReturnType<typeof panelFrame>, view: { width: number; height: number }) {
  const { rect, origin } = frame;
  const shift = (start: number, length: number, room: number) => Math.max(0, Math.min(start, room - length)) - start;
  const x = shift(rect.left, rect.width, view.width);
  const y = shift(rect.top, rect.height, view.height);
  return {
    origin: { x: origin.x + x, y: origin.y + y },
    rect: { ...rect, left: rect.left + x, top: rect.top + y }
  };
}

/** Swatch `open` and the swatches whose panels it lies in, innermost first; empty when nothing is open or it is gone. */
export function openChain(board: Board, open: string | undefined) {
  const chain = new Set<string>();
  for (let owner = open; owner !== undefined && !chain.has(owner); ) {
    const found = findPart(board, owner);
    if (!found) {
      break;
    }

    chain.add(owner);
    owner = found.panel.owner;
  }

  return chain;
}

/** Finds the workbench ancestry without looping on malformed owned-panel cycles. */
function onWorkbench(board: Board, panel: Panel) {
  const seen = new Set<string>();
  let current: Panel | undefined = panel;
  while (current && !seen.has(current.id)) {
    if (current.bench) {
      return true;
    }

    seen.add(current.id);
    current = current.owner ? findPart(board, current.owner)?.panel : undefined;
  }

  return false;
}
