/**
 * A page built in the component canvas's constructor: parts of Paint's UIs placed on a screen of the size it was
 * built for, kept as JSON in `variants/layouts/<id>.json` and shown on the drawing session by the layout variant
 * (`LayoutStudio`). Each part keeps the edge it was nearest to on each axis, so that on another screen size it stays
 * at the same distance from that edge, or from the middle.
 */
export type PageLayout = {
  version: 1;
  /** Shown in variant lists. */
  name: string;
  /** The screen the page was built on, in CSS pixels. */
  screen: { width: number; height: number };
  parts: readonly PlacedPart[];
};

/**
 * A part on the page: which part (`layoutParts`), its box on the built-for screen and the edges it holds to. `x` and
 * `y` are its top left corner; `width` and `height` its size as the constructor measured it.
 */
export type PlacedPart = {
  part: string;
  x: number;
  y: number;
  width: number;
  height: number;
  anchor: { x: 'left' | 'center' | 'right'; y: 'top' | 'middle' | 'bottom' };
};

/**
 * The edges a box holds to on `screen`: on each axis, the edge of the third its center lies in, so that a part near
 * the left edge keeps to it, one in the middle keeps to the middle.
 */
export function anchorOf(box: { x: number; y: number; width: number; height: number }, screen: PageLayout['screen']) {
  const third = (center: number, length: number) => (center < length / 3 ? 0 : center > (length * 2) / 3 ? 2 : 1);
  const x = (['left', 'center', 'right'] as const)[third(box.x + box.width / 2, screen.width)]!;
  const y = (['top', 'middle', 'bottom'] as const)[third(box.y + box.height / 2, screen.height)]!;
  return { x, y };
}

/**
 * Inline CSS that places `part` on a screen of any size as it was on the built-for `screen`: as far from its anchor
 * edge, or with its center as far from the middle.
 */
export function placementOf(part: PlacedPart, screen: PageLayout['screen']) {
  const style: Record<string, string> = { position: 'absolute' };
  const offsetX = part.x + part.width / 2 - screen.width / 2;
  const offsetY = part.y + part.height / 2 - screen.height / 2;
  let translateX = '0';
  let translateY = '0';

  if (part.anchor.x === 'left') {
    style.left = `${part.x}px`;
  } else if (part.anchor.x === 'right') {
    style.right = `${screen.width - part.x - part.width}px`;
  } else {
    style.left = `calc(50% + ${offsetX}px)`;
    translateX = '-50%';
  }

  if (part.anchor.y === 'top') {
    style.top = `${part.y}px`;
  } else if (part.anchor.y === 'bottom') {
    style.bottom = `${screen.height - part.y - part.height}px`;
  } else {
    style.top = `calc(50% + ${offsetY}px)`;
    translateY = '-50%';
  }

  if (translateX !== '0' || translateY !== '0') {
    style.translate = `${translateX} ${translateY}`;
  }

  return style;
}

/** `value` as a page layout, or `undefined` when it is not one, so that a broken file only drops its page. */
export function parsePageLayout(value: unknown): PageLayout | undefined {
  if (!isRecord(value) || value.version !== 1 || typeof value.name !== 'string' || !value.name.trim()) {
    return undefined;
  }

  const { screen, parts } = value;
  if (!isRecord(screen) || !isSize(screen.width) || !isSize(screen.height) || !Array.isArray(parts)) {
    return undefined;
  }

  const placed = parts.filter(isPlacedPart);
  if (placed.length !== parts.length) {
    return undefined;
  }

  return { version: 1, name: value.name.trim(), screen: { width: screen.width, height: screen.height }, parts: placed };
}

/** The variant id and file name for a page named `name`: lowercase words joined by hyphens. */
export function layoutId(name: string) {
  return (
    name
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'page'
  );
}

function isPlacedPart(value: unknown): value is PlacedPart {
  if (!isRecord(value) || typeof value.part !== 'string' || !isRecord(value.anchor)) {
    return false;
  }

  const { x, y, width, height, anchor } = value;
  return (
    [x, y].every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate)) &&
    isSize(width) &&
    isSize(height) &&
    ['left', 'center', 'right'].includes(anchor.x as string) &&
    ['top', 'middle', 'bottom'].includes(anchor.y as string)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSize(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
