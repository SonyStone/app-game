import { Button } from '@app-game/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@app-game/components/ui/popover';
import type { JSX } from '@solidjs/web';
import { For, Show, createEffect, createMemo, createSignal, onSettled, untrack } from 'solid-js';
import type {
  WebGLIndexedBufferBindingSnapshot,
  WebGLInspector,
  WebGLResourceKind,
  WebGLResourceSnapshot,
  WebGLStateRow,
  WebGLStateSnapshot
} from './gl-debug-wrapper';
import {
  WEBGL_HELP,
  helpTopicForResource,
  helpTopicForState,
  type WebGLHelpArticle,
  type WebGLHelpTopic
} from './help-content';
import './webgl-state-diagram.css';

/** Props for the reusable Solid WebGL state diagram. */
export interface WebGLStateDiagramProps {
  /** Inspector returned by `instrumentWebGLContext` or `installWebGLContextHook`. */
  readonly inspector: WebGLInspector;
  /** Native canvas owned by the inspected context. The diagram moves it into a canvas panel. */
  readonly canvas?: HTMLCanvasElement;
  /** Text shown when the inspected canvas remains in another pane. */
  readonly externalCanvasLabel?: string;
  /** Heading shown above the diagram. */
  readonly title?: string;
  /** Opens the reading guide on first render. Defaults to true. */
  readonly initialHelpOpen?: boolean;
  /** Includes allocated objects with no captured relationships on first render. Defaults to false. */
  readonly initialShowUnbound?: boolean;
}

/**
 * Renders live WebGL state, indexed bindings, resources, documentation, and directional connections.
 * Panels can be dragged without affecting the inspected application.
 */
export function WebGLStateDiagram(props: WebGLStateDiagramProps): JSX.Element {
  const [snapshot, setSnapshot] = createSignal(untrack(() => props.inspector.capture()));
  const [paused, setPaused] = createSignal(false);
  const [showUnbound, setShowUnbound] = createSignal(props.initialShowUnbound ?? false);
  const [layoutRevision, setLayoutRevision] = createSignal(0);
  const [resetRevision, setResetRevision] = createSignal(0);
  const [paths, setPaths] = createSignal<readonly ConnectionPath[]>([]);
  const [camera, setCamera] = createSignal<DiagramCamera>({ x: 28, y: 28, zoom: 0.5 });
  const [panning, setPanning] = createSignal(false);
  const [resourceHeights, setResourceHeights] = createSignal<ReadonlyMap<string, number>>(new Map());
  let pendingSnapshot: WebGLStateSnapshot | undefined;
  let viewport!: HTMLDivElement;
  let workspace!: HTMLDivElement;

  const currentVertexArrayId = createMemo(() => findStateResource(snapshot(), 'VERTEX_ARRAY_BINDING'));
  const trackedResources = createMemo(() => visibleResources(snapshot()));
  const connectedIds = createMemo(() => connectedResourceIds(snapshot()));
  const resources = createMemo(() =>
    showUnbound() ? trackedResources() : trackedResources().filter((resource) => connectedIds().has(resource.id))
  );
  const unboundCount = createMemo(
    () => trackedResources().filter((resource) => !connectedIds().has(resource.id)).length
  );
  const resourcePanels = createMemo(() => resources().filter((resource) => resource.id !== currentVertexArrayId()));
  const resourceLayout = createMemo(() => layoutResourcePanels(resourcePanels(), resourceHeights()));
  const resourceLayouts = createMemo(() => resourceLayout().panels);
  const connectionSignature = createMemo(() => {
    const current = snapshot();
    return JSON.stringify({
      resources: current.resources.map((resource) => [
        resource.id,
        resource.deleted,
        resource.relations.map((relation) => [relation.targetId, relation.direct])
      ]),
      global: current.groups.flatMap((group) => group.rows.map((row) => row.resourceId)),
      textures: current.textureUnits.flatMap((unit) => unit.bindings.map((binding) => binding.resourceId)),
      attributes: current.vertexAttributes.map((attribute) => attribute.bufferId),
      indexed: current.indexedBufferBindings.map((binding) => binding.bufferId),
      currentVertexArray: currentVertexArrayId()
    });
  });
  const cameraScale = () => untrack(camera).zoom;

  onSettled(() =>
    props.inspector.subscribe((next) => {
      pendingSnapshot = next;
      if (!untrack(paused)) setSnapshot(next);
    })
  );

  createEffect(
    () => [connectionSignature(), layoutRevision()] as const,
    () => queueMicrotask(() => setPaths(findConnections(workspace, untrack(snapshot))))
  );

  onSettled(() => {
    const observer = new ResizeObserver(() => setLayoutRevision((value) => value + 1));
    observer.observe(workspace);
    window.addEventListener('resize', bumpLayout);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', bumpLayout);
    };
  });

  function bumpLayout(): void {
    setLayoutRevision((value) => value + 1);
  }

  function recordResourceHeight(id: string, height: number): void {
    setResourceHeights((current) => {
      if (Math.abs((current.get(id) ?? 0) - height) < 2) return current;
      const next = new Map(current);
      next.set(id, height);
      return next;
    });
  }

  function togglePaused(): void {
    const next = !untrack(paused);
    setPaused(next);
    if (!next) setSnapshot(pendingSnapshot ?? untrack(() => props.inspector.capture()));
  }

  function zoomBy(factor: number): void {
    const bounds = viewport.getBoundingClientRect();
    zoomAt(untrack(camera).zoom * factor, bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
  }

  function zoomAt(zoom: number, clientX: number, clientY: number): void {
    const nextZoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    const bounds = viewport.getBoundingClientRect();
    const current = untrack(camera);
    const pointer = { x: clientX - bounds.left, y: clientY - bounds.top };
    const world = {
      x: (pointer.x - current.x) / current.zoom,
      y: (pointer.y - current.y) / current.zoom
    };
    setCamera({
      x: pointer.x - world.x * nextZoom,
      y: pointer.y - world.y * nextZoom,
      zoom: nextZoom
    });
  }

  function fitView(): void {
    const panels = [...workspace.querySelectorAll<HTMLElement>('.wgsd-panel, .wgsd-resource-group')];
    if (panels.length === 0 || viewport.clientWidth === 0 || viewport.clientHeight === 0) return;
    const bounds = panelBounds(panels);
    const availableWidth = Math.max(1, viewport.clientWidth - FIT_PADDING * 2);
    const availableHeight = Math.max(1, viewport.clientHeight - FIT_PADDING * 2);
    const zoom = clamp(Math.min(availableWidth / bounds.width, availableHeight / bounds.height), MIN_ZOOM, 1);
    setCamera({
      x: (viewport.clientWidth - bounds.width * zoom) / 2 - bounds.x * zoom,
      y: (viewport.clientHeight - bounds.height * zoom) / 2 - bounds.y * zoom,
      zoom
    });
  }

  function resetNodes(): void {
    setResetRevision((value) => value + 1);
    window.setTimeout(fitView);
  }

  function startPanning(event: PointerEvent): void {
    const target = event.target;
    const overPanel = target instanceof Element && target.closest('.wgsd-panel');
    const overControl = target instanceof Element && target.closest('button, a, input, select, textarea');
    if ((event.button !== 0 || overPanel || overControl) && event.button !== 1) return;

    event.preventDefault();
    viewport.setPointerCapture(event.pointerId);
    setPanning(true);
    const start = untrack(camera);
    const origin = { x: event.clientX, y: event.clientY };
    const move = (moveEvent: PointerEvent) => {
      setCamera({
        ...start,
        x: start.x + moveEvent.clientX - origin.x,
        y: start.y + moveEvent.clientY - origin.y
      });
    };
    const stop = () => {
      setPanning(false);
      viewport.removeEventListener('pointermove', move);
      viewport.removeEventListener('pointerup', stop);
      viewport.removeEventListener('pointercancel', stop);
    };
    viewport.addEventListener('pointermove', move);
    viewport.addEventListener('pointerup', stop);
    viewport.addEventListener('pointercancel', stop);
  }

  function handleWheel(event: WheelEvent): void {
    event.preventDefault();
    zoomAt(untrack(camera).zoom * Math.exp(-event.deltaY * 0.0015), event.clientX, event.clientY);
  }

  return (
    <section class="wgsd-shell">
      <header class="wgsd-toolbar">
        <div>
          <p class="wgsd-kicker">live context inspector</p>
          <h1>{props.title ?? `WebGL ${snapshot().version} state diagram`}</h1>
        </div>
        <div class="wgsd-toolbar__stats" aria-live="polite">
          <span>revision {snapshot().revision}</span>
          <span>{snapshot().drawCalls} draw calls</span>
          <span>{snapshot().resources.filter((resource) => !resource.deleted).length} live objects</span>
        </div>
        <div class="wgsd-toolbar__actions">
          <Button type="button" onClick={togglePaused}>
            {paused() ? 'Resume' : 'Pause'}
          </Button>
          <Button type="button" onClick={() => setSnapshot(props.inspector.capture())}>
            Capture now
          </Button>
          <Button type="button" onClick={resetNodes}>
            Reset nodes
          </Button>
          <Button type="button" onClick={() => setShowUnbound((value) => !value)}>
            {showUnbound() ? 'Hide unbound' : `Show unbound (${unboundCount()})`}
          </Button>
          <HelpPopover topic="overview" triggerClass="wgsd-toolbar__help" defaultOpen={props.initialHelpOpen !== false}>
            Help
          </HelpPopover>
        </div>
      </header>

      <div class="wgsd-legend" aria-label="Connection legend">
        <span>
          <i class="is-direct" /> direct binding or attachment
        </span>
        <span>
          <i class="is-indirect" /> relationship observed at draw time
        </span>
        <span>arrows point to the referenced state or object</span>
      </div>

      <div
        ref={viewport}
        class={`wgsd-viewport${panning() ? 'is-panning' : ''}`}
        style={{
          'background-position': `${camera().x}px ${camera().y}px`,
          'background-size': `${24 * camera().zoom}px ${24 * camera().zoom}px`
        }}
        onPointerDown={startPanning}
        onWheel={handleWheel}
      >
        <nav class="wgsd-camera-controls" aria-label="Diagram camera controls">
          <Button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => zoomBy(1 / 1.2)}>
            −
          </Button>
          <Button type="button" onClick={fitView}>
            Fit
          </Button>
          <Button
            type="button"
            aria-label="Reset zoom to 100 percent"
            title="Reset zoom to 100%"
            onClick={() => {
              const bounds = viewport.getBoundingClientRect();
              zoomAt(1, bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
            }}
          >
            {Math.round(camera().zoom * 100)}%
          </Button>
          <Button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => zoomBy(1.2)}>
            +
          </Button>
        </nav>

        <div
          ref={workspace}
          class="wgsd-workspace"
          style={{
            width: `${resourceLayout().width}px`,
            height: `${resourceLayout().height}px`,
            transform: `translate3d(${camera().x}px, ${camera().y}px, 0) scale(${camera().zoom})`
          }}
        >
          <For each={resourceLayout().groups}>
            {(group) => (
              <div
                class="wgsd-resource-group"
                style={{
                  left: `${group.x}px`,
                  top: `${group.y}px`,
                  width: `${group.width}px`,
                  height: `${group.height}px`
                }}
              >
                <header>
                  <span>{group.title}</span>
                  <small>{group.count} objects</small>
                </header>
              </div>
            )}
          </For>

          <ConnectionLayer paths={paths()} />

          <DiagramPanel
            id="global"
            title="global state"
            tone="global"
            helpTopic="common"
            initial={{ x: 100, y: 100, width: 480 }}
            onMove={bumpLayout}
            resetRevision={resetRevision()}
            cameraScale={cameraScale}
          >
            <For each={snapshot().groups} keyed={false}>
              {(group) => <StateGroupView group={group()} />}
            </For>
            <TextureUnits snapshot={snapshot()} />
            <IndexedBufferBindings bindings={snapshot().indexedBufferBindings} />
          </DiagramPanel>

          <DiagramPanel
            id="canvas"
            connectionTargetId="canvas"
            title="canvas / default framebuffer"
            tone="canvas"
            helpTopic="canvas"
            initial={{ x: 720, y: 100, width: props.canvas ? Math.max(340, props.canvas.width + 2) : 420 }}
            onMove={bumpLayout}
            resetRevision={resetRevision()}
            cameraScale={cameraScale}
          >
            <Show
              when={props.canvas}
              keyed
              fallback={
                <p class="wgsd-external-canvas">
                  {props.externalCanvasLabel ?? 'The canvas remains in the inspected application.'}
                </p>
              }
            >
              {(canvas) => <CanvasHost canvas={canvas} />}
            </Show>
          </DiagramPanel>

          <DiagramPanel
            id="calls"
            title="recent WebGL calls"
            tone="activity"
            helpTopic="calls"
            initial={{ x: 1300, y: 100, width: 450 }}
            onMove={bumpLayout}
            resetRevision={resetRevision()}
            cameraScale={cameraScale}
          >
            <CallLog snapshot={snapshot()} />
          </DiagramPanel>

          <DiagramPanel
            id="vertex-array"
            connectionTargetId={currentVertexArrayId() ?? 'vertex-array-default'}
            title={currentVertexArrayId() ?? 'default vertex array'}
            tone="vertex-array"
            helpTopic="vertex-attributes"
            initial={{ x: 720, y: 720, width: 760 }}
            onMove={bumpLayout}
            resetRevision={resetRevision()}
            cameraScale={cameraScale}
          >
            <VertexAttributes snapshot={snapshot()} />
          </DiagramPanel>

          <For each={resourceLayouts()} keyed={false}>
            {(entry) => (
              <DiagramPanel
                id={`resource-${entry().resource.id}`}
                connectionTargetId={entry().resource.id}
                title={entry().resource.id}
                tone={entry().resource.kind}
                helpTopic={helpTopicForResource(entry().resource.kind)}
                initial={entry().position}
                onMove={bumpLayout}
                resetRevision={resetRevision()}
                cameraScale={cameraScale}
                followInitial
                onResize={(height) => recordResourceHeight(entry().resource.id, height)}
                deleted={entry().resource.deleted}
                unbound={!connectedIds().has(entry().resource.id)}
              >
                <ResourceView resource={entry().resource} />
              </DiagramPanel>
            )}
          </For>
        </div>
      </div>
    </section>
  );
}

interface PanelPosition {
  readonly x: number;
  readonly y: number;
  readonly width: number;
}

interface DiagramCamera {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

interface ResourcePanelLayout {
  readonly resource: WebGLResourceSnapshot;
  readonly position: PanelPosition;
  readonly estimatedHeight: number;
}

interface ResourceLayoutPlan {
  readonly panels: readonly ResourcePanelLayout[];
  readonly groups: readonly ResourceGroupLayout[];
  readonly width: number;
  readonly height: number;
}

interface ResourceGroupLayout {
  readonly id: string;
  readonly title: string;
  readonly count: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface ResourceGroupDefinition {
  readonly id: string;
  readonly title: string;
  readonly kinds: readonly WebGLResourceKind[];
}

function layoutResourcePanels(
  resources: readonly WebGLResourceSnapshot[],
  measuredHeights: ReadonlyMap<string, number>
): ResourceLayoutPlan {
  const definitions = RESOURCE_GROUPS.map((definition: ResourceGroupDefinition) => ({
    definition,
    resources: resources
      .filter((resource) => definition.kinds.includes(resource.kind))
      .toSorted((left, right) => compareResources(left, right, definition))
  })).filter((group) => group.resources.length > 0);
  const panels: ResourcePanelLayout[] = [];
  const groups: ResourceGroupLayout[] = [];
  let rowY = RESOURCE_START_Y;

  for (let index = 0; index < definitions.length; index += RESOURCE_GROUPS_PER_ROW) {
    const row = definitions
      .slice(index, index + RESOURCE_GROUPS_PER_ROW)
      .map((group, column) =>
        layoutResourceGroup(
          group.definition,
          group.resources,
          measuredHeights,
          RESOURCE_START_X + column * (RESOURCE_GROUP_WIDTH + RESOURCE_GROUP_COLUMN_GAP),
          rowY
        )
      );
    for (const group of row) {
      panels.push(...group.panels);
      groups.push(group.layout);
    }
    rowY += Math.max(...row.map((group) => group.layout.height)) + RESOURCE_GROUP_ROW_GAP;
  }

  return {
    panels,
    groups,
    width: Math.max(1900, ...groups.map((group) => group.x + group.width + RESOURCE_CANVAS_PADDING)),
    height: Math.max(1700, ...groups.map((group) => group.y + group.height + RESOURCE_CANVAS_PADDING))
  };
}

interface LaidOutResourceGroup {
  readonly layout: ResourceGroupLayout;
  readonly panels: readonly ResourcePanelLayout[];
}

function layoutResourceGroup(
  definition: ResourceGroupDefinition,
  resources: readonly WebGLResourceSnapshot[],
  measuredHeights: ReadonlyMap<string, number>,
  x: number,
  y: number
): LaidOutResourceGroup {
  const panels: ResourcePanelLayout[] = [];
  let rowY = y + RESOURCE_GROUP_HEADER_HEIGHT + RESOURCE_GROUP_PADDING;

  for (let index = 0; index < resources.length; index += RESOURCE_COLUMNS_PER_GROUP) {
    const row = resources.slice(index, index + RESOURCE_COLUMNS_PER_GROUP).map((resource, column) => {
      const estimatedHeight = Math.max(estimateResourceHeight(resource), measuredHeights.get(resource.id) ?? 0);
      return {
        resource,
        position: {
          x: x + RESOURCE_GROUP_PADDING + column * RESOURCE_COLUMN_WIDTH,
          y: rowY,
          width: RESOURCE_PANEL_WIDTH
        },
        estimatedHeight
      } satisfies ResourcePanelLayout;
    });
    panels.push(...row);
    rowY += Math.max(...row.map((panel) => panel.estimatedHeight)) + RESOURCE_ROW_GAP;
  }

  return {
    panels,
    layout: {
      id: definition.id,
      title: definition.title,
      count: resources.length,
      x,
      y,
      width: RESOURCE_GROUP_WIDTH,
      height: rowY - y - RESOURCE_ROW_GAP + RESOURCE_GROUP_PADDING
    }
  };
}

function compareResources(
  left: WebGLResourceSnapshot,
  right: WebGLResourceSnapshot,
  definition: ResourceGroupDefinition
): number {
  const kindDifference = definition.kinds.indexOf(left.kind) - definition.kinds.indexOf(right.kind);
  return kindDifference || left.id.localeCompare(right.id, undefined, { numeric: true });
}

function estimateResourceHeight(resource: WebGLResourceSnapshot): number {
  const tableHeight = resource.details.reduce((height, row) => {
    const keyLines = Math.max(1, Math.ceil(row.key.length / RESOURCE_KEY_CHARACTERS_PER_LINE));
    const valueLines = Math.max(1, Math.ceil(row.value.length / RESOURCE_VALUE_CHARACTERS_PER_LINE));
    return height + Math.max(keyLines, valueLines) * RESOURCE_TABLE_LINE_HEIGHT + RESOURCE_TABLE_ROW_PADDING;
  }, 0);
  const relationRows = Math.ceil(resource.relations.length / 2);
  return RESOURCE_PANEL_CHROME_HEIGHT + tableHeight + relationRows * RESOURCE_RELATION_ROW_HEIGHT;
}

interface DiagramPanelProps {
  readonly id: string;
  readonly connectionTargetId?: string;
  readonly title: string;
  readonly tone: string;
  readonly helpTopic: WebGLHelpTopic;
  readonly initial: PanelPosition;
  readonly onMove: () => void;
  readonly resetRevision: number;
  /** Returns the current camera scale without subscribing every panel to camera updates. */
  readonly cameraScale: () => number;
  /** Keeps an automatically laid-out panel aligned with updated layout coordinates until the user drags it. */
  readonly followInitial?: boolean;
  /** Reports content-driven height changes so the parent layout can preserve spacing. */
  readonly onResize?: (height: number) => void;
  readonly deleted?: boolean;
  readonly unbound?: boolean;
  readonly children: JSX.Element;
}

function DiagramPanel(props: DiagramPanelProps): JSX.Element {
  const [position, setPosition] = createSignal(untrack(() => props.initial));
  const panelClass = () =>
    [
      'wgsd-panel',
      `wgsd-panel--${props.tone}`,
      props.deleted ? 'is-deleted' : undefined,
      props.unbound ? 'is-unbound' : undefined
    ]
      .filter(Boolean)
      .join(' ');
  let panel!: HTMLElement;
  let dragged = false;
  let panelIdentity = untrack(() => props.id);

  createEffect(
    () => [props.id, props.initial, props.followInitial] as const,
    ([identity, initial, followInitial]) => {
      if (identity !== panelIdentity) {
        panelIdentity = identity;
        dragged = false;
      }
      if (!followInitial || dragged) return;
      setPosition((current) => (samePosition(current, initial) ? current : initial));
    }
  );

  createEffect(
    () => props.resetRevision,
    () => {
      dragged = false;
      setPosition(untrack(() => props.initial));
      props.onMove();
    }
  );

  onSettled(() => {
    if (!props.onResize) return;
    const observer = new ResizeObserver(() => props.onResize?.(panel.offsetHeight));
    observer.observe(panel);
    props.onResize(panel.offsetHeight);
    return () => observer.disconnect();
  });

  function startDragging(event: PointerEvent): void {
    if (event.button !== 0) return;
    dragged = true;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const start = position();
    const scale = props.cameraScale();
    const originX = event.clientX;
    const originY = event.clientY;
    const move = (moveEvent: PointerEvent) => {
      const maxX = Math.max(0, (panel.parentElement?.clientWidth ?? Infinity) - start.width);
      setPosition({
        ...start,
        x: Math.max(0, Math.min(maxX, start.x + (moveEvent.clientX - originX) / scale)),
        y: Math.max(0, start.y + (moveEvent.clientY - originY) / scale)
      });
      props.onMove();
    };
    const stop = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', stop);
      target.removeEventListener('pointercancel', stop);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', stop);
    target.addEventListener('pointercancel', stop);
  }

  return (
    <article
      ref={panel}
      id={`wgsd-${props.id}`}
      class={panelClass()}
      style={{ left: `${position().x}px`, top: `${position().y}px`, width: `${position().width}px` }}
      data-connection-target={props.connectionTargetId}
    >
      <header class="wgsd-panel__title" onPointerDown={startDragging}>
        <span>{props.title}</span>
        <span class="wgsd-panel__controls">
          <Show when={props.deleted}>
            <small>delete requested</small>
          </Show>
          <Show when={props.unbound}>
            <small>unbound</small>
          </Show>
          <HelpButton topic={props.helpTopic} />
          <span class="wgsd-grip">drag</span>
        </span>
      </header>
      <div class="wgsd-panel__body">{props.children}</div>
    </article>
  );
}

function samePosition(left: PanelPosition, right: PanelPosition): boolean {
  return left.x === right.x && left.y === right.y && left.width === right.width;
}

function StateGroupView(props: { readonly group: WebGLStateSnapshot['groups'][number] }): JSX.Element {
  const topic = () => (props.group.id in WEBGL_HELP ? (props.group.id as WebGLHelpTopic) : 'state');
  return (
    <details class="wgsd-group" open={props.group.id === 'common' || props.group.id === 'clear'}>
      <summary>
        <span>{props.group.title}</span>
        <HelpButton topic={topic()} />
      </summary>
      <StateTable rows={props.group.rows} />
    </details>
  );
}

function StateTable(props: { readonly rows: readonly WebGLStateRow[] }): JSX.Element {
  return (
    <table class="wgsd-table">
      <tbody>
        <For each={props.rows} keyed={false}>
          {(row) => (
            <tr>
              <th>
                <HelpPopover topic={helpTopicForState(row().key)} triggerClass="wgsd-help-target">
                  {row().key}
                </HelpPopover>
              </th>
              <td data-source-id={row().resourceId} class={row().resourceId ? 'is-link' : undefined}>
                {row().value}
              </td>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  );
}

function TextureUnits(props: { readonly snapshot: WebGLStateSnapshot }): JSX.Element {
  const columns = () => props.snapshot.textureUnits[0]?.bindings ?? [];
  return (
    <details class="wgsd-group" open>
      <summary>
        <span>texture units</span>
        <HelpButton topic="texture-units" />
      </summary>
      <div class="wgsd-table-scroll">
        <table class="wgsd-table wgsd-table--indexed">
          <thead>
            <tr>
              <th>unit</th>
              <For each={columns()}>{(binding) => <th>{binding.key}</th>}</For>
            </tr>
          </thead>
          <tbody>
            <For each={props.snapshot.textureUnits} keyed={false}>
              {(unit) => (
                <tr
                  class={unit().active ? 'is-active' : undefined}
                  data-connection-target={`texture-unit-${unit().index}`}
                >
                  <th>{unit().index}</th>
                  <For each={unit().bindings} keyed={false}>
                    {(binding) => <td data-source-id={binding().resourceId}>{binding().value}</td>}
                  </For>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </details>
  );
}

function IndexedBufferBindings(props: {
  readonly bindings: readonly WebGLIndexedBufferBindingSnapshot[];
}): JSX.Element {
  const visible = () => props.bindings.filter((binding) => binding.bufferId);
  return (
    <Show when={visible().length}>
      <details class="wgsd-group" open>
        <summary>
          <span>indexed buffer bindings</span>
          <HelpButton topic="indexed-buffers" />
        </summary>
        <table class="wgsd-table wgsd-table--indexed">
          <thead>
            <tr>
              <th>target</th>
              <th>#</th>
              <th>buffer</th>
              <th>offset</th>
              <th>size</th>
            </tr>
          </thead>
          <tbody>
            <For each={visible()}>
              {(binding) => (
                <tr>
                  <th>{binding.target}</th>
                  <td>{binding.index}</td>
                  <td data-source-id={binding.bufferId}>{binding.buffer}</td>
                  <td>{binding.offset}</td>
                  <td>{binding.size}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </details>
    </Show>
  );
}

function VertexAttributes(props: { readonly snapshot: WebGLStateSnapshot }): JSX.Element {
  const resource = () => {
    const id = findStateResource(props.snapshot, 'VERTEX_ARRAY_BINDING');
    return props.snapshot.resources.find((candidate) => candidate.id === id);
  };
  return (
    <div class="wgsd-table-scroll">
      <div class="wgsd-section-heading">
        <span>attribute bindings</span>
        <HelpButton topic="vertex-attributes" />
      </div>
      <table class="wgsd-table wgsd-table--indexed">
        <thead>
          <tr>
            <th>#</th>
            <th>enabled</th>
            <th>size</th>
            <th>type</th>
            <th>normalize</th>
            <th>stride</th>
            <th>offset</th>
            <th>divisor</th>
            <th>buffer</th>
          </tr>
        </thead>
        <tbody>
          <For each={props.snapshot.vertexAttributes} keyed={false}>
            {(attribute) => (
              <tr class={attribute().enabled ? 'is-active' : undefined}>
                <th>{attribute().index}</th>
                <td>{String(attribute().enabled)}</td>
                <td>{attribute().size}</td>
                <td>{attribute().type}</td>
                <td>{attribute().normalized}</td>
                <td>{attribute().stride}</td>
                <td>{attribute().offset}</td>
                <td>{attribute().divisor}</td>
                <td data-source-id={attribute().bufferId}>{attribute().buffer}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <Show when={resource()} keyed>
        {(current) => <ResourceRelations relations={current.relations} />}
      </Show>
    </div>
  );
}

function CallLog(props: { readonly snapshot: WebGLStateSnapshot }): JSX.Element {
  return (
    <ol class="wgsd-call-log">
      <For each={[...props.snapshot.recentCalls].reverse().slice(0, 18)}>
        {(call) => (
          <li class={call.status === 'error' ? 'is-error' : undefined}>
            <span>{call.sequence}</span>
            <code>
              {call.name}({call.arguments})
            </code>
            <Show when={call.status === 'error'}>
              <small>{call.status === 'error' ? call.message : ''}</small>
            </Show>
          </li>
        )}
      </For>
    </ol>
  );
}

function ResourceView(props: { readonly resource: WebGLResourceSnapshot }): JSX.Element {
  return (
    <div class="wgsd-resource">
      <div class="wgsd-resource__kind">
        <span>{props.resource.kind}</span>
        <HelpButton topic={helpTopicForResource(props.resource.kind)} />
      </div>
      <Show when={props.resource.details.length} fallback={<p class="wgsd-empty">No recorded setup calls</p>}>
        <StateTable rows={props.resource.details} />
      </Show>
      <Show when={props.resource.relations.length}>
        <ResourceRelations relations={props.resource.relations} />
      </Show>
    </div>
  );
}

function ResourceRelations(props: { readonly relations: WebGLResourceSnapshot['relations'] }): JSX.Element {
  return (
    <div class="wgsd-resource__links">
      <span>references</span>
      <For each={props.relations}>
        {(relation) => (
          <button
            type="button"
            class={relation.direct ? 'is-direct' : 'is-indirect'}
            data-source-id={relation.targetId}
            data-connection-direct={String(relation.direct)}
            title={`${relation.label}: ${relation.targetId}`}
          >
            <small>{relation.label}</small>
            <code>{relation.targetId}</code>
          </button>
        )}
      </For>
    </div>
  );
}

function CanvasHost(props: { readonly canvas: HTMLCanvasElement }): JSX.Element {
  let host!: HTMLDivElement;
  onSettled(() => host.append(props.canvas));
  return <div ref={host} class="wgsd-canvas-host" />;
}

function HelpButton(props: { readonly topic: WebGLHelpTopic }): JSX.Element {
  return (
    <HelpPopover
      topic={props.topic}
      triggerClass="wgsd-help-button"
      ariaLabel={`Help: ${WEBGL_HELP[props.topic].title}`}
    >
      ?
    </HelpPopover>
  );
}

interface HelpPopoverProps {
  readonly topic: WebGLHelpTopic;
  readonly triggerClass: string;
  readonly ariaLabel?: string;
  readonly defaultOpen?: boolean;
  readonly children: JSX.Element;
}

/** Presents the selected guide article next to its trigger without blocking the diagram. */
function HelpPopover(props: HelpPopoverProps): JSX.Element {
  const article = (): WebGLHelpArticle => WEBGL_HELP[props.topic];
  return (
    <Popover defaultOpen={props.defaultOpen} placement="bottom-start" flip shift={8}>
      <PopoverTrigger
        type="button"
        class={props.triggerClass}
        aria-label={props.ariaLabel}
        onPointerDown={(event: PointerEvent) => event.stopPropagation()}
      >
        {props.children}
      </PopoverTrigger>
      <PopoverContent class="wgsd-help-popover">
        <header>
          <p>WebGL state guide</p>
          <h2>{article().title}</h2>
        </header>
        <div class="wgsd-help-popover__content">
          <p class="wgsd-help-popover__intro">{article().intro}</p>
          <For each={article().sections}>
            {(section) => (
              <section>
                <Show when={section.heading}>
                  <h3>{section.heading}</h3>
                </Show>
                <p>{section.body}</p>
                <Show when={section.bullets} keyed>
                  {(bullets) => (
                    <ul>
                      <For each={bullets}>{(bullet) => <li>{bullet}</li>}</For>
                    </ul>
                  )}
                </Show>
                <Show when={section.code}>
                  <pre>
                    <code>{section.code}</code>
                  </pre>
                </Show>
              </section>
            )}
          </For>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface ConnectionPath {
  readonly d: string;
  readonly color: string;
  readonly arrowHead: string;
  readonly direct: boolean;
}

function ConnectionLayer(props: { readonly paths: readonly ConnectionPath[] }): JSX.Element {
  return (
    <svg class="wgsd-connections" aria-hidden="true">
      <For each={props.paths}>
        {(path) => (
          <g class={path.direct ? 'is-direct' : 'is-indirect'}>
            <path d={path.d} stroke={path.color} />
            <polygon points={path.arrowHead} fill={path.color} />
          </g>
        )}
      </For>
    </svg>
  );
}

function findConnections(root: HTMLElement, snapshot: WebGLStateSnapshot): readonly ConnectionPath[] {
  const rootRect = root.getBoundingClientRect();
  const scaleX = root.offsetWidth > 0 ? rootRect.width / root.offsetWidth : 1;
  const scaleY = root.offsetHeight > 0 ? rootRect.height / root.offsetHeight : 1;
  const worldRoot = new DOMRect(0, 0, root.offsetWidth, root.offsetHeight);
  const kindById = new Map(snapshot.resources.map((resource) => [resource.id, resource.kind]));
  kindById.set('canvas', 'framebuffer');
  kindById.set('vertex-array-default', 'vertex-array');
  const targets = new Map<string, HTMLElement>();
  for (const target of root.querySelectorAll<HTMLElement>('[data-connection-target]')) {
    const id = target.dataset.connectionTarget;
    if (id) targets.set(id, target);
  }

  const paths: ConnectionPath[] = [];
  for (const source of root.querySelectorAll<HTMLElement>('[data-source-id]')) {
    if (source.offsetParent === null) continue;
    const id = source.dataset.sourceId;
    if (!id) continue;
    const target = targets.get(id);
    if (!target || target === source.closest('.wgsd-panel')) continue;
    const kind = kindById.get(id) ?? 'unknown';
    const route = routeConnection(
      toWorkspaceRect(source.getBoundingClientRect(), rootRect, scaleX, scaleY),
      toWorkspaceRect(target.getBoundingClientRect(), rootRect, scaleX, scaleY),
      worldRoot
    );
    paths.push({
      d: route.d,
      color: RESOURCE_COLORS[kind],
      arrowHead: arrowHeadPoints(route.end, route.angle),
      direct: source.dataset.connectionDirect !== 'false'
    });
  }
  return paths;
}

function toWorkspaceRect(rect: DOMRect, root: DOMRect, scaleX: number, scaleY: number): DOMRect {
  return new DOMRect(
    (rect.left - root.left) / scaleX,
    (rect.top - root.top) / scaleY,
    rect.width / scaleX,
    rect.height / scaleY
  );
}

interface Point {
  readonly x: number;
  readonly y: number;
}

interface ConnectionRoute {
  readonly d: string;
  readonly end: Point;
  readonly angle: number;
}

function routeConnection(source: DOMRect, target: DOMRect, root: DOMRect): ConnectionRoute {
  const gap = 19;
  if (source.right <= target.left) {
    const start = { x: source.right - root.left, y: source.top + source.height / 2 - root.top };
    const end = { x: target.left - root.left - gap, y: target.top + Math.min(26, target.height / 2) - root.top };
    const bend = Math.max(46, Math.abs(end.x - start.x) * 0.42);
    return {
      d: `M ${start.x} ${start.y} C ${start.x + bend} ${start.y}, ${end.x - bend} ${end.y}, ${end.x} ${end.y}`,
      end,
      angle: 0
    };
  }
  if (source.left >= target.right) {
    const start = { x: source.left - root.left, y: source.top + source.height / 2 - root.top };
    const end = { x: target.right - root.left + gap, y: target.top + Math.min(26, target.height / 2) - root.top };
    const bend = Math.max(46, Math.abs(end.x - start.x) * 0.42);
    return {
      d: `M ${start.x} ${start.y} C ${start.x - bend} ${start.y}, ${end.x + bend} ${end.y}, ${end.x} ${end.y}`,
      end,
      angle: Math.PI
    };
  }

  const sourceAbove = source.bottom <= target.top + target.height / 2;
  const startX = source.left + source.width / 2 - root.left;
  const startY = (sourceAbove ? source.bottom : source.top) - root.top;
  const endX = target.left + target.width / 2 - root.left;
  const endY = (sourceAbove ? target.top - gap : target.bottom + gap) - root.top;
  const bend = Math.max(46, Math.abs(endY - startY) * 0.42);
  const end = { x: endX, y: endY };
  return {
    d: sourceAbove
      ? `M ${startX} ${startY} C ${startX} ${startY + bend}, ${endX} ${endY - bend}, ${endX} ${endY}`
      : `M ${startX} ${startY} C ${startX} ${startY - bend}, ${endX} ${endY + bend}, ${endX} ${endY}`,
    end,
    angle: sourceAbove ? Math.PI / 2 : -Math.PI / 2
  };
}

function arrowHeadPoints(end: Point, angle: number): string {
  const length = 15;
  const halfWidth = 6;
  const directionX = Math.cos(angle);
  const directionY = Math.sin(angle);
  const baseX = end.x - directionX * length;
  const baseY = end.y - directionY * length;
  const perpendicularX = -directionY * halfWidth;
  const perpendicularY = directionX * halfWidth;
  return `${end.x},${end.y} ${baseX + perpendicularX},${baseY + perpendicularY} ${baseX - perpendicularX},${baseY - perpendicularY}`;
}

function visibleResources(snapshot: WebGLStateSnapshot): readonly WebGLResourceSnapshot[] {
  const referenced = new Set(
    snapshot.resources.flatMap((resource) => resource.relations.map((relation) => relation.targetId))
  );
  return snapshot.resources.filter((resource) => !resource.deleted || referenced.has(resource.id));
}

function connectedResourceIds(snapshot: WebGLStateSnapshot): ReadonlySet<string> {
  const resourceIds = new Set(snapshot.resources.map((resource) => resource.id));
  const connected = new Set<string>();
  const add = (id: string | undefined) => {
    if (id && resourceIds.has(id)) connected.add(id);
  };

  for (const group of snapshot.groups) for (const row of group.rows) add(row.resourceId);
  for (const unit of snapshot.textureUnits) for (const binding of unit.bindings) add(binding.resourceId);
  for (const attribute of snapshot.vertexAttributes) add(attribute.bufferId);
  for (const binding of snapshot.indexedBufferBindings) add(binding.bufferId);
  for (const resource of snapshot.resources) {
    if (resource.relations.length > 0) connected.add(resource.id);
    for (const relation of resource.relations) add(relation.targetId);
  }
  return connected;
}

function findStateResource(snapshot: WebGLStateSnapshot, key: string): string | undefined {
  return snapshot.groups.flatMap((group) => group.rows).find((row) => row.key === key)?.resourceId;
}

interface WorldBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function panelBounds(panels: readonly HTMLElement[]): WorldBounds {
  const left = Math.min(...panels.map((panel) => panel.offsetLeft));
  const top = Math.min(...panels.map((panel) => panel.offsetTop));
  const right = Math.max(...panels.map((panel) => panel.offsetLeft + panel.offsetWidth));
  const bottom = Math.max(...panels.map((panel) => panel.offsetTop + panel.offsetHeight));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

const MIN_ZOOM = 0.06;
const MAX_ZOOM = 2.4;
const FIT_PADDING = 48;
const RESOURCE_START_X = 100;
const RESOURCE_START_Y = 1600;
const RESOURCE_PANEL_WIDTH = 360;
const RESOURCE_COLUMN_WIDTH = 460;
const RESOURCE_ROW_GAP = 120;
const RESOURCE_COLUMNS_PER_GROUP = 3;
const RESOURCE_GROUPS_PER_ROW = 2;
const RESOURCE_GROUP_PADDING = 70;
const RESOURCE_GROUP_HEADER_HEIGHT = 58;
const RESOURCE_GROUP_COLUMN_GAP = 180;
const RESOURCE_GROUP_ROW_GAP = 220;
const RESOURCE_CANVAS_PADDING = 140;
const RESOURCE_GROUP_WIDTH =
  RESOURCE_GROUP_PADDING * 2 + (RESOURCE_COLUMNS_PER_GROUP - 1) * RESOURCE_COLUMN_WIDTH + RESOURCE_PANEL_WIDTH;
const RESOURCE_PANEL_CHROME_HEIGHT = 90;
const RESOURCE_TABLE_LINE_HEIGHT = 17;
const RESOURCE_TABLE_ROW_PADDING = 8;
const RESOURCE_RELATION_ROW_HEIGHT = 45;
const RESOURCE_KEY_CHARACTERS_PER_LINE = 21;
const RESOURCE_VALUE_CHARACTERS_PER_LINE = 28;

const RESOURCE_GROUPS = [
  {
    id: 'vertex-input',
    title: 'vertex input & buffers',
    kinds: ['vertex-array', 'buffer']
  },
  {
    id: 'shader-pipeline',
    title: 'programs & shaders',
    kinds: ['program', 'shader']
  },
  {
    id: 'textures',
    title: 'textures & sampling',
    kinds: ['texture', 'sampler']
  },
  {
    id: 'render-targets',
    title: 'framebuffers & attachments',
    kinds: ['framebuffer', 'renderbuffer']
  },
  {
    id: 'coordination',
    title: 'feedback, queries & synchronization',
    kinds: ['transform-feedback', 'query', 'sync', 'unknown']
  }
] as const satisfies readonly ResourceGroupDefinition[];

const RESOURCE_COLORS: Readonly<Record<WebGLResourceKind, string>> = {
  buffer: '#7bd88f',
  framebuffer: '#6ee7f2',
  program: '#ff9f6e',
  query: '#c6a0f6',
  renderbuffer: '#58c7d5',
  sampler: '#f3d45b',
  shader: '#ff7f8e',
  sync: '#9aa8bd',
  texture: '#ef91d0',
  'transform-feedback': '#96df68',
  'vertex-array': '#b69df8',
  unknown: '#9aa8bd'
};
