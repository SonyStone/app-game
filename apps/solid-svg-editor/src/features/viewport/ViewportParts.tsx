import { Dynamic } from '@solidjs/web';
import { createMemo, createSignal, For, Match, Show, Switch } from 'solid-js';

import type { Contour, HoverTarget, InteractionState } from '../../editor/contours';
import type { CommandSelection } from '../../editor/path-selection';

import { createGridLines } from '../../editor/handles';
import { decorativeIconProps } from '../../editor/svg-icon';
import type {
  AppSettings,
  DragSelectionMode,
  HandleDescriptor,
  TransformBoxHandleDescriptor,
  ViewRect
} from '../../editor/types';
import { createDismissible } from '../ui/createDismissible';
import { IconButton } from '../ui/IconButton';
import ClearIcon from '../ui/icons/Clear.svg';
import PlusIcon from '../ui/icons/Plus.svg';
import { MenuButton, MenuLabel } from '../ui/MenuItem';
import ExpandIcon from './icons/Expand.svg';
import FileBrowseIcon from './icons/FileBrowse.svg';
import PasteIcon from './icons/Paste.svg';
import MinusIcon from './icons/Minus.svg';
import ReferenceIcon from './icons/Reference.svg';
import SnapIcon from './icons/Snap.svg';
import VisualsIcon from './icons/Visuals.svg';
import { useI18n } from '../../i18n/I18nProvider';

export function ViewportToolbar(props: {
  readonly settings: AppSettings;
  readonly setSettings: (setter: (settings: AppSettings) => AppSettings) => void;
  readonly zoom: number;
  readonly zoomBy: (factor: number) => void;
  readonly centerFrame: () => void;
  readonly isFullscreen: boolean;
  readonly toggleFullscreen: () => void;
  readonly openReferenceDialog: () => void;
  readonly pasteReferenceImage: () => void;
  readonly hasReference: boolean;
  readonly showReference: boolean;
  readonly setShowReference: (show: boolean) => void;
  readonly overlayReference: boolean;
  readonly setOverlayReference: (overlay: boolean) => void;
  readonly clearReference: () => void;
  readonly dragSelectionMode: DragSelectionMode;
  readonly setDragSelectionMode: (mode: DragSelectionMode) => void;
}) {
  const { t } = useI18n();
  const [visualsOpen, setVisualsOpen] = createSignal(false);
  const [referenceOpen, setReferenceOpen] = createSignal(false);
  let leftTools: HTMLDivElement | undefined;
  createDismissible({
    open: () => visualsOpen() || referenceOpen(),
    container: () => leftTools,
    close: () => {
      setVisualsOpen(false);
      setReferenceOpen(false);
    }
  });

  return (
    <div
      class="viewport-toolbar relative z-10 flex min-w-0 items-center justify-between bg-[var(--base)] px-1"
      data-testid="viewport-toolbar"
    >
      <div ref={(element) => (leftTools = element)} class="viewport-left-tools flex min-w-0 items-center gap-1" data-testid="viewport-left-tools">
        <IconButton
          icon={VisualsIcon}
          label={t('Visuals')}
          testId="viewport-visuals-button"
          active={visualsOpen()}
          onClick={() => {
            setVisualsOpen(!visualsOpen());
            setReferenceOpen(false);
          }}
        />
        <Show when={visualsOpen()}>
          <div
            class="popover viewport-popover absolute top-8 left-1 z-50 grid min-w-47.5 gap-0.5 rounded-md border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_96%,#000)] p-1.25 shadow-[0_12px_28px_#0008]"
            data-testid="viewport-visuals-popover"
          >
            <MenuLabel data-testid="show-grid-toggle">
              <input
                type="checkbox"
                data-testid="show-grid-checkbox"
                checked={props.settings.showGrid}
                onChange={(event) =>
                  props.setSettings((settings) => ({ ...settings, showGrid: event.currentTarget.checked }))
                }
              />
              {t('Show grid')}
            </MenuLabel>
            <MenuLabel data-testid="show-handles-toggle">
              <input
                type="checkbox"
                data-testid="show-handles-checkbox"
                checked={props.settings.showHandles}
                onChange={(event) =>
                  props.setSettings((settings) => ({ ...settings, showHandles: event.currentTarget.checked }))
                }
              />
              {t('Show handles')}
            </MenuLabel>
            <MenuLabel data-testid="view-rasterized-toggle">
              <input
                type="checkbox"
                data-testid="view-rasterized-checkbox"
                checked={props.settings.viewRasterized}
                onChange={(event) =>
                  props.setSettings((settings) => ({ ...settings, viewRasterized: event.currentTarget.checked }))
                }
              />
              {t('Show rasterized SVG')}
            </MenuLabel>
          </div>
        </Show>
        <IconButton
          icon={ReferenceIcon}
          label="Reference"
          testId="viewport-reference-button"
          active={referenceOpen()}
          onClick={() => {
            setReferenceOpen(!referenceOpen());
            setVisualsOpen(false);
          }}
        />
        <Show when={referenceOpen()}>
          <div
            class="popover viewport-popover absolute top-8 left-1 z-50 grid min-w-47.5 gap-0.5 rounded-md border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_96%,#000)] p-1.25 shadow-[0_12px_28px_#0008]"
            data-testid="viewport-reference-popover"
          >
            <MenuButton
              type="button"
              icon={FileBrowseIcon}
              data-testid="load-reference-button"
              onClick={props.openReferenceDialog}
            >
              {t('Load reference image')}
            </MenuButton>
            <MenuButton type="button" icon={PasteIcon} data-testid="paste-reference-button" onClick={props.pasteReferenceImage}>
              {t('Paste reference image')}
            </MenuButton>
            <MenuButton
              type="button"
              icon={ClearIcon}
              data-testid="clear-reference-button"
              disabled={!props.hasReference}
              onClick={props.clearReference}
            >
              {t('Clear reference image')}
            </MenuButton>
            <MenuLabel disabled={!props.hasReference} data-testid="show-reference-toggle">
              <input
                type="checkbox"
                data-testid="show-reference-checkbox"
                checked={props.showReference}
                disabled={!props.hasReference}
                onChange={(event) => props.setShowReference(event.currentTarget.checked)}
              />
              {t('Show reference image')}
            </MenuLabel>
            <MenuLabel disabled={!props.hasReference} data-testid="overlay-reference-toggle">
              <input
                type="checkbox"
                data-testid="overlay-reference-checkbox"
                checked={props.overlayReference}
                disabled={!props.hasReference}
                onChange={(event) => props.setOverlayReference(event.currentTarget.checked)}
              />
              {t('Overlay reference image')}
            </MenuLabel>
          </div>
        </Show>
        <button
          class={[
            'snap-button inline-grid h-6.5 w-6.5 cursor-pointer place-items-center rounded-[5px] border border-[var(--soft-border)] bg-[var(--panel-2)] p-0 hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_22%,var(--panel-2))] [&.active]:border-[var(--accent)] [&.active]:bg-[color-mix(in_srgb,var(--accent)_22%,var(--panel-2))]',
            { active: props.settings.snapEnabled }
          ]}
          type="button"
          data-testid="snap-toggle-button"
          onClick={() => props.setSettings((settings) => ({ ...settings, snapEnabled: !settings.snapEnabled }))}
        >
          <SnapIcon {...decorativeIconProps} />
        </button>
        <input
          class="snap-input block h-6.5 min-h-5.5 w-16 min-w-0 rounded-[5px] border border-[var(--soft-border)] bg-[#080b12] text-center font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]"
          type="number"
          min="0.001"
          step="1"
          name="snap-size"
          aria-label={t('Snap size')}
          data-testid="snap-size-input"
          value={props.settings.snapSize}
          disabled={!props.settings.snapEnabled}
          onChange={(event) =>
            props.setSettings((settings) => ({
              ...settings,
              snapSize: Math.max(0.001, Number.parseFloat(event.currentTarget.value) || 1)
            }))
          }
        />
        <div
          class="selection-mode-toggle inline-grid grid-flow-col gap-0.5 rounded-[5px] border border-[var(--soft-border)] bg-[color-mix(in_srgb,var(--panel)_74%,#000)] p-0.5"
          data-testid="selection-mode-toggle"
        >
          <button
            type="button"
            class={[
              'h-6 cursor-pointer rounded-[3px] border-0 bg-transparent px-2 py-0 text-[11px] text-[var(--muted)] [&.active]:bg-[color-mix(in_srgb,var(--accent)_24%,var(--panel-2))] [&.active]:text-[var(--text)]',
              { active: props.dragSelectionMode === 'intersect' }
            ]}
            title="Select touched objects"
            data-testid="selection-mode-intersect-button"
            onClick={() => props.setDragSelectionMode('intersect')}
          >
            Touch
          </button>
          <button
            type="button"
            class={[
              'h-6 cursor-pointer rounded-[3px] border-0 bg-transparent px-2 py-0 text-[11px] text-[var(--muted)] [&.active]:bg-[color-mix(in_srgb,var(--accent)_24%,var(--panel-2))] [&.active]:text-[var(--text)]',
              { active: props.dragSelectionMode === 'contain' }
            ]}
            title="Select enclosed objects"
            data-testid="selection-mode-contain-button"
            onClick={() => props.setDragSelectionMode('contain')}
          >
            Inside
          </button>
        </div>
      </div>
      <div class="zoom-widget flex min-w-0 items-center gap-1" data-testid="zoom-widget">
        <IconButton
          icon={ExpandIcon}
          label={t('Toggle fullscreen')}
          testId="fullscreen-toggle-button"
          active={props.isFullscreen}
          onClick={props.toggleFullscreen}
        />
        <IconButton
          icon={MinusIcon}
          label={t('Zoom out')}
          testId="zoom-out-button"
          onClick={() => props.zoomBy(1 / Math.SQRT2)}
        />
        <button
          class="inline-grid h-6.5 w-18 cursor-pointer place-items-center rounded-[5px] border border-[var(--soft-border)] bg-[var(--panel-2)] p-0 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] leading-none hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_22%,var(--panel-2))]"
          type="button"
          data-testid="zoom-reset-button"
          onClick={props.centerFrame}
        >
          {Math.round(props.zoom * 100)}%
        </button>
        <IconButton icon={PlusIcon} label={t('Zoom in')} testId="zoom-in-button" onClick={() => props.zoomBy(Math.SQRT2)} />
      </div>
    </div>
  );
}

export function GridLayer(props: {
  readonly viewRect: ViewRect;
  readonly zoom: number;
  readonly color: string;
  readonly moving: boolean;
}) {
  const lines = createMemo(() => createGridLines(props.viewRect, props.zoom, props.moving ? 128 : 64));
  const showLabels = createMemo(() => !props.moving);

  return (
    <g class="grid-layer pointer-events-none font-['GodSVG_Mono',ui-monospace,monospace]" data-testid="grid-layer">
      <For each={lines().minorVertical}>
        {(x) => (
          <line
            x1={x}
            y1={props.viewRect.y}
            x2={x}
            y2={props.viewRect.y + props.viewRect.height}
            stroke={props.color}
            opacity="0.12"
            stroke-width={1 / props.zoom}
          />
        )}
      </For>
      <For each={lines().minorHorizontal}>
        {(y) => (
          <line
            x1={props.viewRect.x}
            y1={y}
            x2={props.viewRect.x + props.viewRect.width}
            y2={y}
            stroke={props.color}
            opacity="0.12"
            stroke-width={1 / props.zoom}
          />
        )}
      </For>
      <For each={lines().majorVertical}>
        {(x) => (
          <>
            <line
              x1={x}
              y1={props.viewRect.y}
              x2={x}
              y2={props.viewRect.y + props.viewRect.height}
              stroke={props.color}
              opacity="0.34"
              stroke-width={1 / props.zoom}
            />
            <Show when={showLabels()}>
              <text
                x={x + 4 / props.zoom}
                y={props.viewRect.y + 16 / props.zoom}
                fill={props.color}
                opacity="0.58"
                font-size={String(13 / props.zoom)}
              >
                {String(x)}
              </text>
            </Show>
          </>
        )}
      </For>
      <For each={lines().majorHorizontal}>
        {(y) => (
          <>
            <line
              x1={props.viewRect.x}
              y1={y}
              x2={props.viewRect.x + props.viewRect.width}
              y2={y}
              stroke={props.color}
              opacity="0.34"
              stroke-width={1 / props.zoom}
            />
            <Show when={showLabels()}>
              <text
                x={props.viewRect.x + 4 / props.zoom}
                y={y + 14 / props.zoom}
                fill={props.color}
                opacity="0.58"
                font-size={String(13 / props.zoom)}
              >
                {String(y)}
              </text>
            </Show>
          </>
        )}
      </For>
      <line
        x1={0}
        y1={props.viewRect.y}
        x2={0}
        y2={props.viewRect.y + props.viewRect.height}
        stroke={props.color}
        opacity="0.7"
        stroke-width={1 / props.zoom}
      />
      <line
        x1={props.viewRect.x}
        y1={0}
        x2={props.viewRect.x + props.viewRect.width}
        y2={0}
        stroke={props.color}
        opacity="0.7"
        stroke-width={1 / props.zoom}
      />
    </g>
  );
}

/**
 * Handles of the selected and hovered elements, colored by GodSVG's interaction states: a handle is selected when
 * its path command (or its whole element, for shape handles) is selected, and hovered while the pointer is on it.
 * Entering a handle reports its element and command as hovered, so the inspector highlights them too.
 */
export function HandlesLayer(props: {
  readonly handles: readonly HandleDescriptor[];
  readonly zoom: number;
  readonly selectedIds: readonly string[];
  readonly commandSelection: CommandSelection | undefined;
  readonly setHovered: (target: HoverTarget | undefined) => void;
  readonly onHandlePointerDown: (event: PointerEvent, handle: HandleDescriptor) => void;
  /** Double-clicking a path handle selects its whole subpath. */
  readonly onHandleDoubleClick: (handle: HandleDescriptor) => void;
  /** Right-clicking a handle opens the menu for the selected commands. */
  readonly onHandleContextMenu: (event: MouseEvent, handle: HandleDescriptor) => void;
}) {
  const [hoveredKey, setHoveredKey] = createSignal<string>();
  const keyOf = (handle: HandleDescriptor) => `${handle.nodeId}:${handle.id}`;
  const stateOf = (handle: HandleDescriptor): InteractionState => {
    const selected =
      handle.commandIndex === undefined
        ? props.selectedIds.includes(handle.nodeId)
        : props.commandSelection?.nodeId === handle.nodeId && props.commandSelection.indices.includes(handle.commandIndex);
    const hovered = hoveredKey() === keyOf(handle);
    return hovered && selected ? 'hovered-selected' : hovered ? 'hovered' : selected ? 'selected' : 'normal';
  };

  return (
    <g data-testid="handles-layer">
      <For each={props.handles} keyed={keyOf}>
        {(handle) => (
          <g data-testid={`selection-handle-group-${handle().nodeId}-${handle().id}`}>
            <circle
              class="handle cursor-grab fill-white [vector-effect:non-scaling-stroke]"
              data-testid={`selection-handle-${handle().nodeId}-${handle().id}`}
              data-state={stateOf(handle())}
              cx={handle().x}
              cy={handle().y}
              r={(handle().small ? 3.2 : 4.6) / props.zoom}
              stroke={interactionColors[stateOf(handle())]}
              stroke-width={handle().small ? 1.6 : 2}
              onPointerEnter={() => {
                setHoveredKey(keyOf(handle()));
                props.setHovered({ nodeId: handle().nodeId, ...commandOf(handle()) });
              }}
              onPointerLeave={() => {
                setHoveredKey(undefined);
                props.setHovered(undefined);
              }}
              onPointerDown={(event) => props.onHandlePointerDown(event, handle())}
              onDblClick={() => props.onHandleDoubleClick(handle())}
              onContextMenu={(event) => props.onHandleContextMenu(event, handle())}
            />
            <title>{handle().label}</title>
          </g>
        )}
      </For>
    </g>
  );
}

function commandOf(handle: HandleDescriptor): { readonly commandIndex?: number } {
  return handle.commandIndex === undefined ? {} : { commandIndex: handle.commandIndex };
}

/** GodSVG's default contour and handle colors per interaction state. */
const interactionColors = {
  normal: '#111111',
  hovered: '#aaaaaa',
  selected: '#4466ff',
  'hovered-selected': '#ff4444'
} as const satisfies Record<InteractionState, string>;

/**
 * Outlines of the selected and hovered elements (see `collectContours`): shape outlines and per-command path
 * segments drawn 2px wide, helper lines (tangents, radii) thinner and translucent. Ignores the pointer.
 */
export function ContoursLayer(props: { readonly contours: readonly Contour[] }) {
  return (
    <g class="pointer-events-none" fill="none" data-testid="contours-layer">
      <For each={props.contours} keyed={(contour) => contour.key}>
        {(contour) => (
          <Switch>
            <Match when={contour().kind === 'helper' ? (contour() as Extract<Contour, { kind: 'helper' }>) : undefined}>
              {(line) => (
                <line
                  x1={line().from.x}
                  y1={line().from.y}
                  x2={line().to.x}
                  y2={line().to.y}
                  transform={line().transform}
                  stroke={interactionColors[line().state]}
                  stroke-width={1.25}
                  opacity={0.8}
                  vector-effect="non-scaling-stroke"
                />
              )}
            </Match>
            <Match when={contour().kind === 'path' ? (contour() as Extract<Contour, { kind: 'path' }>) : undefined}>
              {(segment) => (
                <path
                  d={segment().d}
                  transform={segment().transform}
                  stroke={interactionColors[segment().state]}
                  stroke-width={2}
                  vector-effect="non-scaling-stroke"
                  data-testid={`contour-${segment().nodeId}-${segment().commandIndex}`}
                  data-state={segment().state}
                />
              )}
            </Match>
            <Match when={contour().kind === 'shape' ? (contour() as Extract<Contour, { kind: 'shape' }>) : undefined}>
              {(shape) => (
                <Dynamic
                  component={shape().name}
                  {...shape().attrs}
                  transform={shape().transform}
                  stroke={interactionColors[shape().state]}
                  stroke-width={2}
                  vector-effect="non-scaling-stroke"
                  data-testid={`contour-${shape().nodeId}`}
                  data-state={shape().state}
                />
              )}
            </Match>
          </Switch>
        )}
      </For>
    </g>
  );
}

export function TransformBoxLayer(props: {
  readonly box: ViewRect | undefined;
  readonly zoom: number;
  readonly onHandlePointerDown: (event: PointerEvent, handle: TransformBoxHandleDescriptor) => void;
}) {
  const handles = createMemo(() => {
    const box = props.box;

    if (!box || box.width <= 0 || box.height <= 0) {
      return [] as readonly TransformBoxHandleDescriptor[];
    }

    const left = box.x;
    const top = box.y;
    const right = box.x + box.width;
    const bottom = box.y + box.height;
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    const rotateOffset = 28 / props.zoom;

    return [
      { kind: 'nw', x: left, y: top, label: 'Resize northwest' },
      { kind: 'n', x: centerX, y: top, label: 'Resize north' },
      { kind: 'ne', x: right, y: top, label: 'Resize northeast' },
      { kind: 'e', x: right, y: centerY, label: 'Resize east' },
      { kind: 'se', x: right, y: bottom, label: 'Resize southeast' },
      { kind: 's', x: centerX, y: bottom, label: 'Resize south' },
      { kind: 'sw', x: left, y: bottom, label: 'Resize southwest' },
      { kind: 'w', x: left, y: centerY, label: 'Resize west' },
      { kind: 'rotate', x: centerX, y: top - rotateOffset, label: 'Rotate selection' }
    ] as const satisfies readonly TransformBoxHandleDescriptor[];
  });

  return (
    <Show when={props.box}>
      {(box) => (
        <g class="transform-box-layer pointer-events-none" data-testid="transform-box-layer">
          <rect
            class="transform-box-outline fill-none stroke-[var(--accent)] [stroke-dasharray:7_5] [vector-effect:non-scaling-stroke]"
            data-testid="transform-box-outline"
            x={box().x}
            y={box().y}
            width={box().width}
            height={box().height}
            stroke-width={1.2}
          />
          <line
            class="transform-box-rotate-line fill-none stroke-[var(--accent)] [stroke-dasharray:7_5] [vector-effect:non-scaling-stroke]"
            data-testid="transform-box-rotate-line"
            x1={box().x + box().width / 2}
            y1={box().y}
            x2={box().x + box().width / 2}
            y2={box().y - 28 / props.zoom}
            stroke-width={1}
          />
          <For each={handles()}>
            {(handle) => (
              <rect
                class={`transform-box-handle pointer-events-auto fill-[#eef4ff] stroke-[#111827] [vector-effect:non-scaling-stroke] hover:fill-[var(--accent)] ${
                  handle.kind === 'nw' || handle.kind === 'se'
                    ? 'cursor-nwse-resize'
                    : handle.kind === 'ne' || handle.kind === 'sw'
                      ? 'cursor-nesw-resize'
                      : handle.kind === 'n' || handle.kind === 's'
                        ? 'cursor-ns-resize'
                        : handle.kind === 'e' || handle.kind === 'w'
                          ? 'cursor-ew-resize'
                          : 'rotate cursor-grab fill-[#ffd166]'
                }`}
                data-transform-handle={handle.kind}
                data-testid={`transform-box-handle-${handle.kind}`}
                x={handle.x - 4.6 / props.zoom}
                y={handle.y - 4.6 / props.zoom}
                width={9.2 / props.zoom}
                height={9.2 / props.zoom}
                rx={1.3 / props.zoom}
                stroke-width={1.2}
                onPointerDown={(event) => props.onHandlePointerDown(event, handle)}
              >
                <title>{handle.label}</title>
              </rect>
            )}
          </For>
        </g>
      )}
    </Show>
  );
}
