import { commandParameters, parsePathData, parsePoints } from '../../path-data';
import { parseLength, type SvgElementNode } from '../../svg-model';
import { createSetAttributesCommand, type AttributeCommandUpdate } from '../commands/attributeCommands';
import { createUpdatePathAnchorCommand } from '../commands/pathCommands';
import { createUpdatePointCommand } from '../commands/pointCommands';
import type { SvgHandleContext } from '../kernel';
import { pathAnchorSelectionTarget, type SelectionTarget } from '../selection-targets';
import { getSvgAttribute } from '../svg-attributes';
import type { HandleDescriptor } from '../types';
import { defaultAttributeValues } from './coreSvgMetadata';

type CoreElementHandleProvider = (context: SvgHandleContext) => readonly HandleDescriptor[];

export const coreElementHandleProviders = {
  circle: createCircleHandles,
  ellipse: createEllipseHandles,
  rect: createRectHandles,
  line: createLineHandles,
  polygon: createPointListHandles,
  polyline: createPointListHandles,
  path: createPathHandles
} as const satisfies Readonly<Record<string, CoreElementHandleProvider>>;

export function getCoreElementHandleProvider(name: string): CoreElementHandleProvider | undefined {
  return isCoreElementHandleName(name) ? coreElementHandleProviders[name] : undefined;
}

function isCoreElementHandleName(name: string): name is keyof typeof coreElementHandleProviders {
  return Object.prototype.hasOwnProperty.call(coreElementHandleProviders, name);
}

export function createCircleHandles({ node }: SvgHandleContext): readonly HandleDescriptor[] {
  const cx = parseLength(getCoreSvgAttribute(node, 'cx'));
  const cy = parseLength(getCoreSvgAttribute(node, 'cy'));
  const r = parseLength(getCoreSvgAttribute(node, 'r'));

  return [
    numericAttributeHandle(node.id, 'center', cx, cy, 'center', (x, y) => ({ cx: x, cy: y })),
    numericAttributeHandle(node.id, 'radius', cx + r, cy, 'r', (x) => ({ r: Math.max(0, x - cx) }))
  ];
}

export function createEllipseHandles({ node }: SvgHandleContext): readonly HandleDescriptor[] {
  const cx = parseLength(getCoreSvgAttribute(node, 'cx'));
  const cy = parseLength(getCoreSvgAttribute(node, 'cy'));
  const rx = parseLength(getCoreSvgAttribute(node, 'rx'));
  const ry = parseLength(getCoreSvgAttribute(node, 'ry'));

  return [
    numericAttributeHandle(node.id, 'center', cx, cy, 'center', (x, y) => ({ cx: x, cy: y })),
    numericAttributeHandle(node.id, 'rx', cx + rx, cy, 'rx', (x) => ({ rx: Math.max(0, x - cx) })),
    numericAttributeHandle(node.id, 'ry', cx, cy + ry, 'ry', (_x, y) => ({ ry: Math.max(0, y - cy) }))
  ];
}

export function createRectHandles({ node }: SvgHandleContext): readonly HandleDescriptor[] {
  const x = parseLength(getCoreSvgAttribute(node, 'x'));
  const y = parseLength(getCoreSvgAttribute(node, 'y'));
  const width = parseLength(getCoreSvgAttribute(node, 'width'));
  const height = parseLength(getCoreSvgAttribute(node, 'height'));

  return [
    numericAttributeHandle(node.id, 'origin', x, y, 'origin', (nextX, nextY) => ({ x: nextX, y: nextY })),
    numericAttributeHandle(node.id, 'size', x + width, y + height, 'size', (nextX, nextY) => ({
      width: Math.max(0, nextX - x),
      height: Math.max(0, nextY - y)
    }))
  ];
}

export function createLineHandles({ node }: SvgHandleContext): readonly HandleDescriptor[] {
  const x1 = parseLength(getCoreSvgAttribute(node, 'x1'));
  const y1 = parseLength(getCoreSvgAttribute(node, 'y1'));
  const x2 = parseLength(getCoreSvgAttribute(node, 'x2'));
  const y2 = parseLength(getCoreSvgAttribute(node, 'y2'));

  return [
    numericAttributeHandle(node.id, 'p1', x1, y1, 'x1 y1', (x, y) => ({ x1: x, y1: y })),
    numericAttributeHandle(node.id, 'p2', x2, y2, 'x2 y2', (x, y) => ({ x2: x, y2: y }))
  ];
}

export function createPointListHandles({ node }: SvgHandleContext): readonly HandleDescriptor[] {
  return parsePoints(getCoreSvgAttribute(node, 'points')).map(([x, y], index) => {
    const createCommand: NonNullable<HandleDescriptor['createCommand']> = (nextX, nextY) =>
      createUpdatePointCommand({ nodeId: node.id, index, x: nextX, y: nextY });

    return numericHandle(
      node.id,
      `point-${index}`,
      x,
      y,
      `point ${index + 1}`,
      createCommand,
      false,
      undefined
    );
  });
}

export function createPathHandles({ node }: SvgHandleContext): readonly HandleDescriptor[] {
  const commands = parsePathData(getCoreSvgAttribute(node, 'd'));
  const handles: HandleDescriptor[] = [];
  let currentX = 0;
  let currentY = 0;
  let subpathX = 0;
  let subpathY = 0;

  commands.forEach((command, commandIndex) => {
    const startX = currentX;
    const startY = currentY;
    const upper = command.command.toUpperCase();
    const relative = command.command === command.command.toLowerCase();
    const paramList = commandParameters(command.command);

    for (const pair of [
      ['x1', 'y1', true],
      ['x2', 'y2', true],
      ['x', 'y', false]
    ] as const) {
      const xParam = paramList.find((param) => param.name === pair[0]);
      const yParam = paramList.find((param) => param.name === pair[1]);

      if (!xParam || !yParam) {
        continue;
      }

      const rawX = command.values[xParam.index] ?? 0;
      const rawY = command.values[yParam.index] ?? 0;
      const absoluteX = relative ? startX + rawX : rawX;
      const absoluteY = relative ? startY + rawY : rawY;
      const createCommand: NonNullable<HandleDescriptor['createCommand']> = (x, y) =>
        createUpdatePathAnchorCommand({
          nodeId: node.id,
          commandIndex,
          updates: [
            { parameter: pair[0], value: x },
            { parameter: pair[1], value: y }
          ]
        });

      handles.push(
        numericHandle(
          node.id,
          `cmd-${commandIndex}-${pair[0]}`,
          absoluteX,
          absoluteY,
          `${command.command} ${pair[0]}/${pair[1]}`,
          createCommand,
          pair[2],
          [
            pathAnchorSelectionTarget(node.id, commandIndex, pair[0]),
            pathAnchorSelectionTarget(node.id, commandIndex, pair[1])
          ]
        )
      );
    }

    if (upper === 'H') {
      const x = command.values[0] ?? 0;
      const absoluteX = relative ? currentX + x : x;
      const createCommand: NonNullable<HandleDescriptor['createCommand']> = (xValue) =>
        createUpdatePathAnchorCommand({
          nodeId: node.id,
          commandIndex,
          updates: [{ parameter: 'x', value: xValue }]
        });

      handles.push(
        numericHandle(
          node.id,
          `cmd-${commandIndex}-h`,
          absoluteX,
          currentY,
          `${command.command} x`,
          createCommand,
          false,
          [pathAnchorSelectionTarget(node.id, commandIndex, 'x')]
        )
      );
      currentX = absoluteX;
    } else if (upper === 'V') {
      const y = command.values[0] ?? 0;
      const absoluteY = relative ? currentY + y : y;
      const createCommand: NonNullable<HandleDescriptor['createCommand']> = (_xValue, yValue) =>
        createUpdatePathAnchorCommand({
          nodeId: node.id,
          commandIndex,
          updates: [{ parameter: 'y', value: yValue }]
        });

      handles.push(
        numericHandle(
          node.id,
          `cmd-${commandIndex}-v`,
          currentX,
          absoluteY,
          `${command.command} y`,
          createCommand,
          false,
          [pathAnchorSelectionTarget(node.id, commandIndex, 'y')]
        )
      );
      currentY = absoluteY;
    } else if (upper === 'Z') {
      currentX = subpathX;
      currentY = subpathY;
    } else {
      const xIndex = paramList.find((param) => param.name === 'x')?.index;
      const yIndex = paramList.find((param) => param.name === 'y')?.index;

      if (xIndex !== undefined) {
        currentX = relative ? currentX + (command.values[xIndex] ?? 0) : command.values[xIndex] ?? currentX;
      }

      if (yIndex !== undefined) {
        currentY = relative ? currentY + (command.values[yIndex] ?? 0) : command.values[yIndex] ?? currentY;
      }

      if (upper === 'M') {
        subpathX = currentX;
        subpathY = currentY;
      }
    }
  });

  return handles;
}

function numericHandle(
  nodeId: string,
  id: string,
  x: number,
  y: number,
  label: string,
  createCommand: NonNullable<HandleDescriptor['createCommand']>,
  small = false,
  selectionTargets?: readonly SelectionTarget[]
): HandleDescriptor {
  return {
    id,
    nodeId,
    x,
    y,
    label,
    createCommand,
    small,
    commandMode: 'command',
    ...(selectionTargets ? { selectionTargets } : {})
  } satisfies HandleDescriptor;
}

function formatHandleNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function numericAttributeHandle(
  nodeId: string,
  id: string,
  x: number,
  y: number,
  label: string,
  createAttributes: (x: number, y: number) => Readonly<Record<string, number>>,
  small = false
): HandleDescriptor {
  const createCommand: NonNullable<HandleDescriptor['createCommand']> = (nextX, nextY) =>
    createSetAttributesCommand(nodeId, numericAttributeUpdates(createAttributes(nextX, nextY)), `Drag ${label}`);

  return numericHandle(
    nodeId,
    id,
    x,
    y,
    label,
    createCommand,
    small,
    undefined
  );
}

function numericAttributeUpdates(attrs: Readonly<Record<string, number>>): readonly AttributeCommandUpdate[] {
  return Object.entries(attrs).map(([name, value]) => ({
    name,
    value: formatHandleNumber(value)
  }));
}

function getCoreSvgAttribute(node: SvgElementNode, name: string): string {
  const defaults: Record<string, string> = defaultAttributeValues;
  return getSvgAttribute(node, name, defaults[name] ?? '');
}
