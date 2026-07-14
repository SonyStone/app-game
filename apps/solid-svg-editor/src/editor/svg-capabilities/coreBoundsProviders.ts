import { commandParameters, parsePathData, parsePoints, type PathCommand } from '../../path-data';
import { parseLength, type SvgElementNode } from '../../svg-model';
import { rectFromPoints, type Point, type Rect } from '../geometry';
import type { SvgBoundsContext } from '../kernel';
import { getSvgAttribute } from '../svg-attributes';
import { defaultAttributeValues } from './coreSvgMetadata';

type CoreElementBoundsProvider = (context: SvgBoundsContext) => Rect | undefined;

export const coreElementBoundsProviders = {
  svg: createSizeBounds,
  image: createSizeBounds,
  use: createSizeBounds,
  rect: createSizeBounds,
  circle: createCircleBounds,
  ellipse: createEllipseBounds,
  line: createLineBounds,
  polygon: createPointListBounds,
  polyline: createPointListBounds,
  path: createPathBounds
} as const satisfies Readonly<Record<string, CoreElementBoundsProvider>>;

export function getCoreElementBoundsProvider(name: string): CoreElementBoundsProvider | undefined {
  return isCoreElementBoundsName(name) ? coreElementBoundsProviders[name] : undefined;
}

function isCoreElementBoundsName(name: string): name is keyof typeof coreElementBoundsProviders {
  return Object.prototype.hasOwnProperty.call(coreElementBoundsProviders, name);
}

export function createSizeBounds({ node }: SvgBoundsContext): Rect | undefined {
  const x = numberAttr(node, 'x');
  const y = numberAttr(node, 'y');
  const width = numberAttr(node, 'width');
  const height = numberAttr(node, 'height');

  if (width <= 0 || height <= 0) {
    return undefined;
  }

  return { x, y, width, height };
}

export function createCircleBounds({ node }: SvgBoundsContext): Rect | undefined {
  const r = numberAttr(node, 'r');

  if (r <= 0) {
    return undefined;
  }

  const cx = numberAttr(node, 'cx');
  const cy = numberAttr(node, 'cy');
  return { x: cx - r, y: cy - r, width: r * 2, height: r * 2 };
}

export function createEllipseBounds({ node }: SvgBoundsContext): Rect | undefined {
  const rx = numberAttr(node, 'rx');
  const ry = numberAttr(node, 'ry');

  if (rx <= 0 || ry <= 0) {
    return undefined;
  }

  const cx = numberAttr(node, 'cx');
  const cy = numberAttr(node, 'cy');
  return { x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2 };
}

export function createLineBounds({ node }: SvgBoundsContext): Rect | undefined {
  return rectFromPoints([
    { x: numberAttr(node, 'x1'), y: numberAttr(node, 'y1') },
    { x: numberAttr(node, 'x2'), y: numberAttr(node, 'y2') }
  ]);
}

export function createPointListBounds({ node }: SvgBoundsContext): Rect | undefined {
  return rectFromPoints(parsePoints(getCoreSvgAttribute(node, 'points')).map(([x, y]) => ({ x, y })));
}

export function createPathBounds({ node }: SvgBoundsContext): Rect | undefined {
  const points: Point[] = [];
  let x = 0;
  let y = 0;
  let subpathStartX = 0;
  let subpathStartY = 0;

  for (const command of parsePathData(getCoreSvgAttribute(node, 'd'))) {
    const normalized = command.command.toUpperCase();
    const relative = command.command === command.command.toLowerCase();
    const start = { x, y };

    if (normalized !== 'M') {
      points.push(start);
    }

    if (normalized === 'Z') {
      x = subpathStartX;
      y = subpathStartY;
      points.push({ x, y });
      continue;
    }

    for (const point of commandCoordinatePoints(command, relative, start)) {
      points.push(point);
    }

    const endpoint = commandEndpoint(command, relative, start);

    if (endpoint) {
      x = endpoint.x;
      y = endpoint.y;

      if (normalized === 'M') {
        subpathStartX = x;
        subpathStartY = y;
      }
    }
  }

  return rectFromPoints(points);
}

function commandCoordinatePoints(command: PathCommand, relative: boolean, start: Point): readonly Point[] {
  const params = commandParameters(command.command);
  const points: Point[] = [];

  for (const xParam of params.filter((param) => param.name.startsWith('x'))) {
    const yParamName = xParam.name.replace('x', 'y');
    const yParam = params.find((param) => param.name === yParamName);
    const xValue = command.values[xParam.index];
    const yValue = yParam ? command.values[yParam.index] : undefined;

    if (xValue === undefined || yValue === undefined) {
      continue;
    }

    points.push({
      x: relative ? start.x + xValue : xValue,
      y: relative ? start.y + yValue : yValue
    });
  }

  return points;
}

function commandEndpoint(command: PathCommand, relative: boolean, start: Point): Point | undefined {
  const normalized = command.command.toUpperCase();
  const params = commandParameters(command.command);

  if (normalized === 'H') {
    const value = command.values[0];
    return value === undefined ? undefined : { x: relative ? start.x + value : value, y: start.y };
  }

  if (normalized === 'V') {
    const value = command.values[0];
    return value === undefined ? undefined : { x: start.x, y: relative ? start.y + value : value };
  }

  const xParam = [...params].reverse().find((param) => param.name === 'x');
  const yParam = [...params].reverse().find((param) => param.name === 'y');
  const xValue = xParam ? command.values[xParam.index] : undefined;
  const yValue = yParam ? command.values[yParam.index] : undefined;

  if (xValue === undefined || yValue === undefined) {
    return undefined;
  }

  return {
    x: relative ? start.x + xValue : xValue,
    y: relative ? start.y + yValue : yValue
  };
}

function numberAttr(node: SvgElementNode, name: string): number {
  return parseLength(getCoreSvgAttribute(node, name));
}

function getCoreSvgAttribute(node: SvgElementNode, name: string): string {
  const defaults: Record<string, string> = defaultAttributeValues;
  return getSvgAttribute(node, name, defaults[name] ?? '');
}
