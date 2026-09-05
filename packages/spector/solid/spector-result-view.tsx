import type { JSX } from '@solidjs/web';
import {
  For,
  Loading,
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
  createProjection,
  createSignal,
  lazy,
  onCleanup
} from 'solid-js';
import type { ICapture } from '../shared/capture/capture';
import type { ICommandCapture, State } from '../shared/capture/commandCapture';
import type { IMeshCapture } from '../shared/capture/meshCapture';
import type { ISceneCapture } from '../shared/capture/sceneCapture';
import type { ITextureCapture } from '../shared/capture/textureCapture';
import { extractMeshDraws, extractTextureAssets, type SpectorTextureAsset } from './capture-assets';
import {
  capturedValueMatches,
  commandStatusLabel,
  createVisualCheckpoints,
  filterCommands,
  formatCapturedValue,
  isRecord,
  normalizeVisualState,
  readShaderProgram,
  type SpectorShaderProgram,
  type SpectorVisualCheckpoint
} from './capture-model';
import { MeshPreview } from './mesh-preview';
import { ScenePreview } from './scene-preview';
import type { SpectorProgramSource } from './spector-session';

/** Props for the complete Solid capture-history and command-inspection frontend. */
export interface SpectorResultViewProps {
  readonly captures: readonly ICapture[];
  readonly onAddCapture?: (capture: ICapture) => void;
  /** Receives the selected capture so hosts can resolve its live program owner. */
  readonly onCompileProgram?: (source: SpectorProgramSource, capture: ICapture) => Promise<void>;
  /** Reads bounded live geometry for a draw call in the selected capture. */
  readonly onReadMesh?: (capture: ICapture, commandId: number, attributeName?: string) => Promise<IMeshCapture>;
  /** Reconstructs all unique live meshes and their simple texture materials. */
  readonly onReadScene?: (capture: ICapture) => Promise<ISceneCapture>;
  /** Samples a live captured texture into a portable preview image. */
  readonly onReadTexture?: (
    capture: ICapture,
    commandId: number,
    uniformIndex: number,
    textureIndex: number
  ) => Promise<ITextureCapture>;
  readonly onClose?: () => void;
}

type ResultTab = 'captures' | 'information' | 'textures' | 'meshes' | 'init-state' | 'commands' | 'end-state';
type ShaderStage = Parameters<typeof ShaderEditor>[0]['initialStage'];

interface OpenedShader {
  readonly program: SpectorShaderProgram;
  readonly stage: ShaderStage;
}

const RESULT_TABS = [
  { id: 'captures', label: 'Captures' },
  { id: 'information', label: 'Information' },
  { id: 'textures', label: 'Textures' },
  { id: 'meshes', label: 'Meshes' },
  { id: 'init-state', label: 'Init State' },
  { id: 'commands', label: 'Commands' },
  { id: 'end-state', label: 'End State' }
] as const satisfies readonly { readonly id: ResultTab; readonly label: string }[];

/** Renders all capture, state, command, framebuffer, and shader views without imperative DOM state. */
export function SpectorResultView(props: SpectorResultViewProps): JSX.Element {
  const [tab, setTab] = createSignal<ResultTab>('commands');
  const [search, setSearch] = createSignal('');
  const [selectedCapture, setSelectedCapture] = createSignal<ICapture>();
  const [selectedCommandId, setSelectedCommandId] = createSignal<number>();
  const [openedShader, setOpenedShader] = createSignal<OpenedShader>();
  const [menuOpen, setMenuOpen] = createSignal(false);
  let latestCapture: ICapture | undefined;

  createEffect(
    () => props.captures[0],
    (newestCapture) => {
      if (newestCapture && newestCapture !== latestCapture) {
        latestCapture = newestCapture;
        setOpenedShader(undefined);
        setSelectedCapture(newestCapture);
        setSelectedCommandId(newestCapture.commands[0]?.id);
        setTab('commands');
      }
    }
  );

  const commands = createMemo(() => {
    const capture = selectedCapture();
    return capture ? filterCommands(capture.commands, search()) : [];
  });
  const selectedCommand = createMemo(() => {
    const visibleCommands = commands();
    return visibleCommands.find((command) => command.id === selectedCommandId()) ?? visibleCommands[0];
  });
  const checkpoints = createMemo(() => {
    const capture = selectedCapture();
    return capture ? createVisualCheckpoints(capture.initState, capture.commands) : [];
  });
  const textureCount = createMemo(() => {
    const capture = selectedCapture();
    return capture ? extractTextureAssets(capture).length : 0;
  });
  const meshCount = createMemo(() => {
    const capture = selectedCapture();
    return capture ? extractMeshDraws(capture).length : 0;
  });

  function selectCapture(capture: ICapture): void {
    setOpenedShader(undefined);
    setSelectedCapture(capture);
    setSelectedCommandId(capture.commands[0]?.id);
    setTab('commands');
  }

  function selectCommand(command: ICommandCapture): void {
    setSelectedCommandId(command.id);
    setOpenedShader(undefined);
  }

  function selectCheckpoint(checkpoint: SpectorVisualCheckpoint): void {
    const command = selectedCapture()?.commands[checkpoint.commandIndex];
    if (command) selectCommand(command);
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (tab() !== 'commands' || isEditableTarget(event.target)) return;
    const visibleCommands = commands();
    const commandIndex = visibleCommands.findIndex((command) => command.id === selectedCommand()?.id);

    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const direction = event.key === 'ArrowUp' ? -1 : 1;
      const command = visibleCommands[clamp(commandIndex + direction, 0, visibleCommands.length - 1)];
      if (command) selectCommand(command);
      return;
    }

    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault();
      const currentIndex = activeCheckpointIndex(checkpoints(), selectedCapture(), selectedCommand());
      const direction = event.key === 'PageUp' ? -1 : 1;
      const checkpoint = checkpoints()[clamp(currentIndex + direction, 0, checkpoints().length - 1)];
      if (checkpoint) selectCheckpoint(checkpoint);
    }
  }

  return (
    <div
      class="absolute inset-0 box-content overflow-hidden border border-black bg-[#222] font-['Consolas','monaco','monospace'] text-[14px] leading-normal font-medium text-[#f9f9f9] outline-none"
      tabindex="0"
      onKeyDown={onKeyDown}
    >
      <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Montserrat:300,400" />
      <header class="absolute top-0 right-0 left-0 z-[999999] flex h-[42px] flex-nowrap justify-start overflow-x-auto overflow-y-hidden border-b-2 border-[#222] bg-[#2c2c2c] font-['Montserrat',sans-serif] text-[13px] leading-10 font-light max-[1024px]:block max-[1024px]:h-auto max-[1024px]:overflow-visible">
        <button
          class="hidden h-10 bg-[#2c2c2c] px-5 text-[#ccc] hover:bg-[#222] hover:text-[#c9c9c9] max-[1024px]:block"
          type="button"
          onClick={() => setMenuOpen(!menuOpen())}
        >
          Menu
        </button>
        <label
          class={`relative h-10 w-[137.703125px] shrink-0 max-[1024px]:bg-[#464646] ${
            menuOpen() ? 'max-[1024px]:block' : 'max-[1024px]:hidden'
          }`}
        >
          <span class="sr-only">Search capture</span>
          <input
            class="relative -top-px h-10 w-[132px] border-0 bg-[#464646] px-2 pr-7 font-['Montserrat',sans-serif] text-[13px] font-light text-[#f9f9f9] outline-none placeholder:text-[#ccc]"
            type="text"
            placeholder="Search..."
            value={search()}
            onInput={(event) => setSearch(event.currentTarget.value)}
          />
          <button
            class="absolute top-0 left-[105.359375px] z-[9000] h-10 bg-transparent px-2 text-[#f9f9f9] outline-none hover:text-[#f0640d]"
            type="button"
            aria-label="Clear search"
            onClick={() => setSearch('')}
          >
            X
          </button>
        </label>
        <For each={RESULT_TABS}>
          {(item) => (
            <div class={menuOpen() ? 'max-[1024px]:block' : 'max-[1024px]:hidden'}>
              <button
                class={tabButtonClass(tab() === item.id)}
                type="button"
                onClick={() => {
                  setTab(item.id);
                  setMenuOpen(false);
                }}
              >
                {item.label}
                <Show when={item.id === 'textures'}> ({textureCount()})</Show>
                <Show when={item.id === 'meshes'}> ({meshCount()})</Show>
                <Show when={item.id === 'commands' && selectedCapture()}>
                  {' ('}
                  {selectedCapture()?.commands.length}
                  {')'}
                </Show>
              </button>
            </div>
          )}
        </For>
        <div class={menuOpen() ? 'max-[1024px]:block' : 'max-[1024px]:hidden'}>
          <button
            class={tabButtonClass(false)}
            type="button"
            onClick={() => {
              setMenuOpen(false);
              props.onClose?.();
            }}
          >
            Close
          </button>
        </div>
      </header>

      <div class="absolute top-10 right-0 bottom-0 left-0">
        <Show
          when={selectedCapture()}
          fallback={<EmptyView message="Capture a WebGL frame to inspect its commands and state." />}
        >
          {(capture) => (
            <Switch>
              <Match when={tab() === 'captures'}>
                <CaptureHistory
                  captures={props.captures}
                  selected={capture()}
                  onSelect={selectCapture}
                  onLoad={props.onAddCapture}
                />
              </Match>
              <Match when={tab() === 'information'}>
                <CaptureInformation capture={capture()} search={search()} />
              </Match>
              <Match when={tab() === 'textures'}>
                <TextureGallery
                  capture={capture()}
                  onReadTexture={props.onReadTexture}
                  onOpenCommand={(commandId) => {
                    const command = capture().commands.find((candidate) => candidate.id === commandId);
                    if (command) selectCommand(command);
                    setTab('commands');
                  }}
                />
              </Match>
              <Match when={tab() === 'meshes'}>
                <MeshInspector capture={capture()} onReadMesh={props.onReadMesh} onReadScene={props.onReadScene} />
              </Match>
              <Match when={tab() === 'init-state'}>
                <StateView value={capture().initState} search={search()} />
              </Match>
              <Match when={tab() === 'end-state'}>
                <StateView value={capture().endState} search={search()} />
              </Match>
              <Match when={tab() === 'commands'}>
                <Show
                  when={openedShader()}
                  fallback={
                    <CommandWorkspace
                      capture={capture()}
                      commands={commands()}
                      selected={selectedCommand()}
                      checkpoints={checkpoints()}
                      onSelectCommand={selectCommand}
                      onSelectCheckpoint={selectCheckpoint}
                      onOpenShader={(program, stage) => setOpenedShader({ program, stage })}
                    />
                  }
                >
                  {(shader) => (
                    <Loading fallback={<EmptyView message="Loading shader editor…" />}>
                      <ShaderEditor
                        program={shader().program}
                        initialStage={shader().stage}
                        details={
                          <Show when={selectedCommand()}>
                            {(command) => (
                              <CommandDetails
                                command={command()}
                                visualState={activeCheckpoint(checkpoints(), capture(), command())?.state}
                              />
                            )}
                          </Show>
                        }
                        onClose={() => setOpenedShader(undefined)}
                        onCompile={
                          props.onCompileProgram ? (source) => props.onCompileProgram!(source, capture()) : undefined
                        }
                      />
                    </Loading>
                  )}
                </Show>
              </Match>
            </Switch>
          )}
        </Show>
      </div>
    </div>
  );
}

function CaptureHistory(props: {
  readonly captures: readonly ICapture[];
  readonly selected: ICapture;
  readonly onSelect: (capture: ICapture) => void;
  readonly onLoad?: (capture: ICapture) => void;
}): JSX.Element {
  let fileInput!: HTMLInputElement;

  async function loadCapture(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !props.onLoad) return;
    const value: unknown = JSON.parse(await file.text());
    if (!isCapture(value)) throw new Error(`${file.name} is not a Spector capture.`);
    props.onLoad(value);
    input.value = '';
  }

  return (
    <div class="absolute inset-0 overflow-x-hidden overflow-y-auto bg-[#222]">
      <Show when={props.onLoad}>
        <button
          class="m-[5px] block w-[calc(100%-10px)] border border-dashed border-[#f9f9f9] p-[5px] text-center italic"
          type="button"
          onClick={() => fileInput.click()}
        >
          Drag files here to open a previously saved capture.
        </button>
        <input ref={fileInput} class="hidden" type="file" accept="application/json,.json" onChange={loadCapture} />
      </Show>
      <ul class="m-0 flex list-none flex-row flex-wrap justify-start p-0">
        <For each={props.captures}>
          {(capture) => {
            const visual = () => normalizeVisualState(capture.endState.VisualState);
            return (
              <li class="m-[5px] border border-[#606060]">
                <div
                  class="block cursor-pointer text-left"
                  role="button"
                  tabindex="0"
                  onClick={() => props.onSelect(capture)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') props.onSelect(capture);
                  }}
                >
                  <Show when={visual().attachments[0]?.src} fallback={<span>{visual().status}</span>}>
                    <img
                      class={`${checkerboardClass()} block w-[295px]`}
                      src={encodeURI(visual().attachments[0]?.src ?? '')}
                      alt={visual().framebufferLabel}
                    />
                  </Show>
                  <span
                    class={`block border-[5px] text-center ${
                      capture === props.selected
                        ? 'border-[#f0640d] bg-[#f0640d] text-[#f9f9f9]'
                        : 'border-[#222] bg-[#222]'
                    }`}
                  >
                    {formatCaptureTime(capture)}
                    <button
                      class="relative ml-[10px] inline-block h-6 w-7 align-middle"
                      type="button"
                      aria-label="Download JSON capture"
                      onClick={(event) => {
                        event.stopPropagation();
                        saveCapture(capture);
                      }}
                    >
                      <span class="absolute top-[2px] left-[4px] h-4 w-4 rounded-[1px] border-x-2 border-t-[7px] border-b border-[#f9f9f9] bg-[#d9d9d9]" />
                      <span class="absolute top-[2px] left-[9px] h-[5px] w-[7px] border border-r border-b border-l-4 border-[#d9d9d9] bg-[#f9f9f9]" />
                    </button>
                  </span>
                </div>
              </li>
            );
          }}
        </For>
      </ul>
    </div>
  );
}

function CaptureInformation(props: { readonly capture: ICapture; readonly search: string }): JSX.Element {
  return (
    <div class="absolute inset-0 grid grid-cols-2 overflow-hidden">
      <div class="overflow-x-hidden overflow-y-auto p-[10px]">
        <JsonGroup title="Canvas" value={props.capture.canvas} search={props.search} />
        <JsonGroup title="Context" value={props.capture.context} search={props.search} />
      </div>
      <div class="overflow-x-hidden overflow-y-auto p-[10px]">
        <For each={props.capture.analyses}>
          {(analysis) => (
            <JsonGroup
              title={analysis.analyserName === 'Primitives' ? 'Vertices count' : analysis.analyserName}
              value={analysis}
              search={props.search}
            />
          )}
        </For>
        <JsonGroup title="Frame Memory Changes" value={props.capture.frameMemory} search={props.search} />
        <JsonGroup
          title="Total Memory (seconds since application start: bytes)"
          value={props.capture.memory}
          search={props.search}
        />
      </div>
    </div>
  );
}

function TextureGallery(props: {
  readonly capture: ICapture;
  readonly onReadTexture?: (
    capture: ICapture,
    commandId: number,
    uniformIndex: number,
    textureIndex: number
  ) => Promise<ITextureCapture>;
  readonly onOpenCommand: (commandId: number) => void;
}): JSX.Element {
  const textures = createMemo(() => extractTextureAssets(props.capture));
  const [previews, setPreviews] = createSignal<Readonly<Record<string, ITextureCapture | 'loading'>>>({});
  let previewGeneration = 0;

  createEffect(
    () => ({ capture: props.capture, textures: textures(), readTexture: props.onReadTexture }),
    ({ capture, textures: assets, readTexture }) => {
      const generation = ++previewGeneration;
      setPreviews({});
      if (!readTexture) return;
      void loadTexturePreviews(
        capture,
        assets.filter((asset) => !asset.src).slice(0, AUTO_TEXTURE_PREVIEW_LIMIT),
        readTexture,
        generation
      );
    }
  );

  onCleanup(() => previewGeneration++);

  async function loadTexturePreviews(
    capture: ICapture,
    assets: readonly SpectorTextureAsset[],
    readTexture: NonNullable<typeof props.onReadTexture>,
    generation: number
  ): Promise<void> {
    for (const asset of assets) {
      if (generation !== previewGeneration) return;
      await loadTexturePreview(capture, asset, readTexture, generation);
    }
  }

  async function loadTexturePreview(
    capture: ICapture,
    asset: SpectorTextureAsset,
    readTexture: NonNullable<typeof props.onReadTexture>,
    generation = previewGeneration
  ): Promise<void> {
    setPreviews((current) => ({ ...current, [asset.id]: 'loading' }));
    let result: ITextureCapture;
    try {
      result = await readTexture(capture, asset.commandId, asset.uniformIndex, asset.textureIndex);
    } catch (error: unknown) {
      result = {
        status: 'unavailable',
        commandId: asset.commandId,
        uniformIndex: asset.uniformIndex,
        textureIndex: asset.textureIndex,
        reason: error instanceof Error ? error.message : String(error)
      };
    }
    if (generation !== previewGeneration) return;
    setPreviews((current) => ({ ...current, [asset.id]: result }));
  }

  return (
    <div class="absolute inset-0 overflow-y-auto bg-[#222] p-4">
      <Show when={textures().length > 0} fallback={<EmptyView message="No sampler texture bindings were captured." />}>
        <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          <For each={textures()}>
            {(texture) => {
              const preview = () => previews()[texture.id];
              const source = () => {
                const result = preview();
                return texture.src ?? (result !== 'loading' && result?.status === 'available' ? result.src : undefined);
              };
              const error = () => {
                const result = preview();
                return result !== 'loading' && result?.status === 'unavailable' ? result.reason : undefined;
              };
              return (
                <figure class="m-0 overflow-hidden rounded border border-[#606060] bg-[#191919]">
                  <div class={`${checkerboardClass()} grid h-52 place-items-center overflow-hidden`}>
                    <Show
                      when={source()}
                      fallback={
                        <div class="space-y-2 px-4 text-center text-xs text-[#bbb]">
                          <Show
                            when={preview() === 'loading'}
                            fallback={<span>{error() ?? 'Preview not loaded'}</span>}
                          >
                            <span>Sampling texture on the GPU…</span>
                          </Show>
                          <Show when={preview() !== 'loading' && props.onReadTexture}>
                            <button
                              class="block rounded bg-[#464646] px-3 py-2 hover:bg-[#5a5a5a]"
                              type="button"
                              onClick={() => void loadTexturePreview(props.capture, texture, props.onReadTexture!)}
                            >
                              Retry preview
                            </button>
                          </Show>
                        </div>
                      }
                    >
                      {(src) => (
                        <img class="max-h-full max-w-full object-contain" src={src()} alt={texture.uniformName} />
                      )}
                    </Show>
                  </div>
                  <figcaption class="space-y-1 p-3">
                    <strong class="block break-all text-[#5db0d7]">{texture.uniformName}</strong>
                    <span class="block text-xs text-[#d3d3d3]">
                      {texture.view ?? texture.target}
                      {texture.width && texture.height ? ` · ${texture.width} × ${texture.height}` : ''}
                    </span>
                    <Show when={texture.internalFormat ?? texture.format}>
                      <span class="block text-xs text-[#999]">{texture.internalFormat ?? texture.format}</span>
                    </Show>
                    <button
                      class="mt-2 text-xs text-[#5db0d7] hover:underline"
                      type="button"
                      onClick={() => props.onOpenCommand(texture.commandId)}
                    >
                      Open source command #{texture.commandId}
                    </button>
                  </figcaption>
                </figure>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}

const AUTO_TEXTURE_PREVIEW_LIMIT = 16;

function MeshInspector(props: {
  readonly capture: ICapture;
  readonly onReadMesh?: (capture: ICapture, commandId: number, attributeName?: string) => Promise<IMeshCapture>;
  readonly onReadScene?: (capture: ICapture) => Promise<ISceneCapture>;
}): JSX.Element {
  const draws = createMemo(() => extractMeshDraws(props.capture));
  const [viewMode, setViewMode] = createSignal<'scene' | 'draw'>('scene');
  const [selectedCommandId, setSelectedCommandId] = createSignal<number>();
  const selectedDraw = createMemo(() => draws().find((draw) => draw.commandId === selectedCommandId()) ?? draws()[0]);
  const [mesh, setMesh] = createSignal<IMeshCapture>();
  const [selectedAttributeName, setSelectedAttributeName] = createSignal<string>();
  const [loading, setLoading] = createSignal(false);
  const [scene, setScene] = createSignal<ISceneCapture>();
  const [sceneLoading, setSceneLoading] = createSignal(false);
  const availableMesh = createMemo(() => {
    const result = mesh();
    return result?.status === 'available' ? result : undefined;
  });
  let requestId = 0;
  let sceneRequestId = 0;
  let loadedSceneCapture: ICapture | undefined;

  createEffect(
    () => ({
      attributeName: selectedAttributeName(),
      capture: props.capture,
      draw: selectedDraw(),
      readMesh: props.onReadMesh,
      viewMode: viewMode()
    }),
    ({ attributeName, capture, draw, readMesh, viewMode }) => {
      const currentRequest = ++requestId;
      setMesh(undefined);
      setLoading(false);
      if (viewMode !== 'draw') return;
      if (!draw) return;
      if (!readMesh) {
        setMesh({
          status: 'unavailable',
          commandId: draw.commandId,
          reason: 'Mesh previews require a live page capture; imported JSON files contain metadata only.'
        });
        return;
      }
      setLoading(true);
      void readMesh(capture, draw.commandId, attributeName)
        .then((result) => {
          if (currentRequest === requestId) setMesh(result);
        })
        .catch((error: unknown) => {
          if (currentRequest !== requestId) return;
          setMesh({
            status: 'unavailable',
            commandId: draw.commandId,
            reason: error instanceof Error ? error.message : String(error)
          });
        })
        .finally(() => {
          if (currentRequest === requestId) setLoading(false);
        });
    }
  );

  createEffect(
    () => ({ capture: props.capture, readScene: props.onReadScene, viewMode: viewMode() }),
    ({ capture, readScene, viewMode }) => {
      const currentRequest = ++sceneRequestId;
      if (viewMode !== 'scene' || loadedSceneCapture === capture) return;
      loadedSceneCapture = undefined;
      setScene(undefined);
      if (!readScene) {
        loadedSceneCapture = capture;
        setScene({
          status: 'unavailable',
          reason: 'Scene previews require a live page capture; imported JSON files contain metadata only.'
        });
        return;
      }
      setSceneLoading(true);
      void readScene(capture)
        .then((result) => {
          if (currentRequest !== sceneRequestId) return;
          loadedSceneCapture = capture;
          setScene(result);
        })
        .catch((error: unknown) => {
          if (currentRequest !== sceneRequestId) return;
          loadedSceneCapture = capture;
          setScene({ status: 'unavailable', reason: error instanceof Error ? error.message : String(error) });
        })
        .finally(() => {
          if (currentRequest === sceneRequestId) setSceneLoading(false);
        });
    }
  );

  onCleanup(() => {
    requestId++;
    sceneRequestId++;
  });

  return (
    <div class="absolute inset-0 grid grid-cols-[minmax(240px,28%)_1fr] overflow-hidden bg-[#222]">
      <Show when={draws().length > 0} fallback={<EmptyView message="No buffered draw calls were captured." />}>
        <aside class="min-h-0 overflow-y-auto border-r border-[#606060]">
          <button
            class={`block w-full border-b border-[#3c3c3c] p-3 text-left ${
              viewMode() === 'scene' ? 'bg-[#f37628] text-[#222]' : 'bg-[#222] hover:bg-[#2c2c2c]'
            }`}
            type="button"
            onClick={() => setViewMode('scene')}
          >
            <strong class="block">Full scene</strong>
            <span class="mt-1 block text-xs opacity-80">World-space meshes with captured material textures</span>
          </button>
          <ol class="m-0 list-none p-0">
            <For each={draws()}>
              {(draw) => (
                <li>
                  <button
                    class={`block w-full border-b border-[#3c3c3c] p-3 text-left ${
                      viewMode() === 'draw' && selectedDraw()?.commandId === draw.commandId
                        ? 'bg-[#f37628] text-[#222]'
                        : 'bg-[#222] hover:bg-[#2c2c2c]'
                    }`}
                    type="button"
                    onClick={() => {
                      setViewMode('draw');
                      setSelectedAttributeName(undefined);
                      setSelectedCommandId(draw.commandId);
                    }}
                  >
                    <strong class="block">
                      #{draw.commandId} {draw.commandName}
                    </strong>
                    <span class="mt-1 block text-xs opacity-80">
                      {draw.mode} · {draw.elementCount.toLocaleString()} elements
                      {draw.instanceCount > 1 ? ` · ${draw.instanceCount.toLocaleString()} instances` : ''}
                    </span>
                    <Show when={draw.marker}>
                      <span class="mt-1 block text-xs">{draw.marker}</span>
                    </Show>
                  </button>
                </li>
              )}
            </For>
          </ol>
        </aside>
        <section class="grid min-h-0 grid-rows-[auto_1fr]">
          <Switch>
            <Match when={viewMode() === 'scene'}>
              <header class="border-b border-[#606060] bg-[#2c2c2c] px-4 py-3">
                <strong>Full scene</strong>
                <span class="ml-3 text-xs text-[#bbb]">
                  deduplicated shader-replayed meshes · unlit texture preview
                </span>
              </header>
            </Match>
            <Match when={selectedDraw()}>
              {(draw) => (
                <header class="border-b border-[#606060] bg-[#2c2c2c] px-4 py-3">
                  <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <strong>{draw().mode} mesh</strong>
                    <span class="text-xs text-[#bbb]">
                      {draw().elementCount.toLocaleString()} elements · {draw().attributeCount} attributes
                    </span>
                    <Show when={availableMesh()}>
                      {(result) => (
                        <label class="ml-auto flex items-center gap-2 text-xs text-[#bbb]">
                          Position attribute
                          <select
                            class="max-w-64 rounded border border-[#606060] bg-[#191919] px-2 py-1 text-[#f9f9f9]"
                            value={result().positionSource === 'vertex-shader' ? '' : result().positionAttribute}
                            onChange={(event) => setSelectedAttributeName(event.currentTarget.value || undefined)}
                          >
                            <option value="">Vertex shader output (recommended)</option>
                            <For each={result().availableAttributes}>
                              {(attribute) => (
                                <option value={attribute.name}>
                                  {attribute.name} · {attribute.dimensions}D {attribute.type} · location{' '}
                                  {attribute.location}
                                </option>
                              )}
                            </For>
                          </select>
                        </label>
                      )}
                    </Show>
                  </div>
                  <p class="mt-1 mb-0 text-xs text-[#999]">
                    <Show
                      when={availableMesh()?.positionSource === 'vertex-shader'}
                      fallback={
                        <>
                          Raw vertex buffer · shader deformation is not applied
                          {availableMesh()?.replayReason ? ` · ${availableMesh()?.replayReason}` : ''}
                        </>
                      }
                    >
                      Vertex shader replay · {availableMesh()?.positionSpace} space
                      {availableMesh()?.inverseMatrixName ? ` · inverted ${availableMesh()?.inverseMatrixName}` : ''}
                    </Show>
                  </p>
                </header>
              )}
            </Match>
          </Switch>
          <div class="relative min-h-0">
            <Switch>
              <Match when={viewMode() === 'scene'}>
                <Show when={!sceneLoading()} fallback={<EmptyView message="Replaying and assembling scene meshes…" />}>
                  <Show when={scene()}>{(result) => <SceneCaptureResult result={result()} />}</Show>
                </Show>
              </Match>
              <Match when={viewMode() === 'draw'}>
                <Show when={!loading()} fallback={<EmptyView message="Reading mesh buffers…" />}>
                  <Show when={mesh()}>{(result) => <MeshCaptureResult result={result()} />}</Show>
                </Show>
              </Match>
            </Switch>
          </div>
        </section>
      </Show>
    </div>
  );
}

function MeshCaptureResult(props: { readonly result: IMeshCapture }): JSX.Element {
  return props.result.status === 'available' ? (
    <MeshResult mesh={props.result} />
  ) : (
    <EmptyView message={props.result.reason} />
  );
}

function MeshResult(props: { readonly mesh: Extract<IMeshCapture, { readonly status: 'available' }> }): JSX.Element {
  return (
    <div class="absolute inset-0 grid grid-rows-[1fr_auto]">
      <MeshPreview mesh={props.mesh} />
      <footer class="border-t border-[#606060] bg-[#191919] px-4 py-2 text-xs text-[#bbb]">
        Drag to rotate · Scroll to zoom · Position:{' '}
        {props.mesh.positionSource === 'vertex-shader' ? 'vertex shader output' : props.mesh.positionAttribute} ·{' '}
        {props.mesh.capturedElementCount.toLocaleString()} captured elements
        {props.mesh.truncated ? ' · Preview truncated' : ''}
        {props.mesh.instanceCount > 1 ? ' · Base geometry shown without per-instance transforms' : ''}
      </footer>
    </div>
  );
}

function SceneCaptureResult(props: { readonly result: ISceneCapture }): JSX.Element {
  return props.result.status === 'available' ? (
    <SceneResult scene={props.result} />
  ) : (
    <EmptyView message={props.result.reason} />
  );
}

function SceneResult(props: { readonly scene: Extract<ISceneCapture, { readonly status: 'available' }> }): JSX.Element {
  const [showGuides, setShowGuides] = createSignal(true);
  const [cameraResetRevision, setCameraResetRevision] = createSignal(0);

  return (
    <div class="absolute inset-0 grid grid-rows-[1fr_auto]">
      <ScenePreview scene={props.scene} showGuides={showGuides()} cameraResetRevision={cameraResetRevision()} />
      <footer class="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[#606060] bg-[#191919] px-4 py-2 text-xs text-[#bbb]">
        <label class="flex items-center gap-1" title="Show the floor grid, local XYZ axes, and origin">
          <input
            type="checkbox"
            checked={showGuides()}
            onChange={(event) => setShowGuides(event.currentTarget.checked)}
          />
          Grid + XYZ
        </label>
        <button
          class="border border-[#606060] bg-[#2c2c2c] px-2 py-1 text-[#f9f9f9] hover:border-[#f0640d]"
          type="button"
          onClick={() => setCameraResetRevision((revision) => revision + 1)}
        >
          Reset camera
        </button>
        <span>
          Drag to rotate · Scroll to zoom · {props.scene.meshes.length.toLocaleString()} unique meshes ·{' '}
          {props.scene.texturedMeshCount.toLocaleString()} material-textured ·{' '}
          {props.scene.uvMeshCount.toLocaleString()} with UV · {props.scene.colorTextureCandidateCount.toLocaleString()}{' '}
          color-map candidates
          {props.scene.textureFailureCount
            ? ` · ${props.scene.textureFailureCount.toLocaleString()} texture read failures`
            : ''}
          {' · '}
          {props.scene.duplicateDrawCount.toLocaleString()} duplicate passes removed
          {props.scene.alternateCameraDrawCount
            ? ` · ${props.scene.alternateCameraDrawCount.toLocaleString()} alternate-camera passes excluded`
            : ''}
          {props.scene.unreadableDrawCount
            ? ` · ${props.scene.unreadableDrawCount.toLocaleString()} unreadable draws: ${props.scene.unreadableReasons.join('; ')}`
            : ''}
          {props.scene.limitedDrawCount ? ` · ${props.scene.limitedDrawCount.toLocaleString()} over limit` : ''}
          {props.scene.truncated ? ' · Scene preview truncated' : ''}
        </span>
      </footer>
    </div>
  );
}

function StateView(props: { readonly value: State; readonly search: string }): JSX.Element {
  return (
    <div class="absolute inset-0 overflow-x-hidden overflow-y-auto p-[10px]">
      <JsonTree value={props.value} search={props.search} depth={0} />
    </div>
  );
}

function CommandWorkspace(props: {
  readonly capture: ICapture;
  readonly commands: readonly ICommandCapture[];
  readonly selected?: ICommandCapture;
  readonly checkpoints: readonly SpectorVisualCheckpoint[];
  readonly onSelectCommand: (command: ICommandCapture) => void;
  readonly onSelectCheckpoint: (checkpoint: SpectorVisualCheckpoint) => void;
  readonly onOpenShader: (program: SpectorShaderProgram, stage: ShaderStage) => void;
}): JSX.Element {
  return (
    <div class="absolute inset-0 grid grid-cols-[20%_40%_40%] overflow-hidden">
      <VisualStateList
        capture={props.capture}
        checkpoints={props.checkpoints}
        selected={props.selected}
        onSelect={props.onSelectCheckpoint}
      />
      <CommandList
        commands={props.commands}
        selected={props.selected}
        onSelect={props.onSelectCommand}
        onOpenShader={props.onOpenShader}
      />
      <Show when={props.selected} fallback={<EmptyView message="No command matches this search." />}>
        {(command) => (
          <CommandDetails
            command={command()}
            visualState={activeCheckpoint(props.checkpoints, props.capture, command())?.state}
          />
        )}
      </Show>
    </div>
  );
}

function VisualStateList(props: {
  readonly capture: ICapture;
  readonly checkpoints: readonly SpectorVisualCheckpoint[];
  readonly selected?: ICommandCapture;
  readonly onSelect: (checkpoint: SpectorVisualCheckpoint) => void;
}): JSX.Element {
  const activeIndex = () => activeCheckpointIndex(props.checkpoints, props.capture, props.selected);

  return (
    <ol class="m-0 min-h-0 list-none overflow-x-hidden overflow-y-auto p-[5px]">
      <For each={props.checkpoints}>
        {(checkpoint, index) => (
          <li class="mt-5 mr-[15px] ml-[15px]">
            <button
              class={`block w-full cursor-pointer border text-left ${
                index() === activeIndex() ? 'border-2 border-[#f0640d]' : 'border-[#606060]'
              }`}
              type="button"
              title={checkpoint.label}
              onClick={() => props.onSelect(checkpoint)}
            >
              <VisualPreview value={checkpoint.state} variant="list" />
            </button>
          </li>
        )}
      </For>
    </ol>
  );
}

function CommandList(props: {
  readonly commands: readonly ICommandCapture[];
  readonly selected?: ICommandCapture;
  readonly onSelect: (command: ICommandCapture) => void;
  readonly onOpenShader: (program: SpectorShaderProgram, stage: ShaderStage) => void;
}): JSX.Element {
  let previousSelectedId: number | undefined;
  const selectedRows = createProjection<Record<number, boolean>>((draft) => {
    const selectedId = props.selected?.id;
    if (previousSelectedId !== undefined && previousSelectedId !== selectedId) delete draft[previousSelectedId];
    if (selectedId !== undefined) draft[selectedId] = true;
    previousSelectedId = selectedId;
  }, {});

  return (
    <ol class="m-0 min-h-0 list-none overflow-x-hidden overflow-y-auto p-0 text-[#d3d3d3]">
      <For each={props.commands}>
        {(command, index) => {
          let row!: HTMLLIElement;
          createEffect(
            () => selectedRows[command.id] === true,
            (active) => {
              if (active) queueMicrotask(() => row.scrollIntoView({ block: 'nearest' }));
            }
          );
          const program = () => readShaderProgram(command);

          return (
            <li
              ref={row}
              class={`cursor-pointer p-2 ${commandRowClass(command, selectedRows[command.id] === true, index())}`}
              onClick={() => props.onSelect(command)}
            >
              <Show when={command.marker}>
                <span class="mr-1 text-[16px] leading-[22px] font-black text-[#adff2f]">{command.marker} </span>
              </Show>
              <Show
                when={command.name === 'LOG'}
                fallback={
                  <span class="leading-[22px] break-words">
                    <span class={commandNameClass(command)}>{command.name}</span>
                    {commandTextTail(command)}
                  </span>
                }
              >
                <span class="leading-[22px] font-black break-words text-[#adff2f]">{command.text}</span>
              </Show>
              <Show when={program()}>
                {(shader) => (
                  <span class="block">
                    <button
                      class="m-[5px] inline-block bg-[#222] p-[5px] font-black text-[#5db0d7]"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        props.onSelect(command);
                        props.onOpenShader(shader(), 'vertex');
                      }}
                    >
                      {shader().vertex.name}
                    </button>
                    <button
                      class="m-[5px] inline-block bg-[#222] p-[5px] font-black text-[#5db0d7]"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        props.onSelect(command);
                        props.onOpenShader(shader(), 'fragment');
                      }}
                    >
                      {shader().fragment.name}
                    </button>
                  </span>
                )}
              </Show>
            </li>
          );
        }}
      </For>
    </ol>
  );
}

function CommandDetails(props: { readonly command: ICommandCapture; readonly visualState: unknown }): JSX.Element {
  const extraGroups = () =>
    Object.entries(props.command).filter(
      ([key, value]) =>
        key !== 'VisualState' &&
        key !== 'result' &&
        typeof value === 'object' &&
        value !== null &&
        (!Array.isArray(value) || value.length > 0)
    );
  const global = () => ({
    name: { help: mdnCommandUrl(props.command.name), name: props.command.name },
    duration: props.command.commandEndTime - props.command.startTime,
    ...(props.command.result ? { result: props.command.result } : {}),
    status: commandStatusLabel(props.command.status)
  });

  return (
    <div class="min-h-0 overflow-x-hidden overflow-y-auto bg-[#222]">
      <VisualPreview value={props.visualState} variant="detail" />
      <Show when={props.command.name !== 'LOG'}>
        <JsonGroup title="Global" value={global()} search="" />
      </Show>
      <For each={extraGroups()}>{([key, value]) => <JsonGroup title={humanize(key)} value={value} search="" />}</For>
    </div>
  );
}

function JsonGroup(props: { readonly title: string; readonly value: unknown; readonly search: string }): JSX.Element {
  return (
    <Show when={capturedValueMatches(props.value, props.search)}>
      <section class="m-[10px] block p-[10px] pb-[5px]">
        <h3 class="mb-[5px] block border-b border-[#5db0d7] pb-[5px] text-[16px] font-medium text-[#5db0d7] capitalize">
          {humanize(props.title)}
        </h3>
        <JsonTree value={props.value} search={props.search} depth={0} />
      </section>
    </Show>
  );
}

function JsonTree(props: { readonly value: unknown; readonly search: string; readonly depth: number }): JSX.Element {
  const scalar = () => formatCapturedValue(props.value);
  const entries = () => {
    if (Array.isArray(props.value)) return props.value.map((value, index) => [String(index), value] as const);
    if (!isRecord(props.value)) return [] as readonly (readonly [string, unknown])[];
    return Object.entries(props.value).filter(
      ([key, value]) =>
        !HIDDEN_CAPTURE_KEYS.has(key) && key !== 'VisualState' && capturedValueMatches({ [key]: value }, props.search)
    );
  };

  return (
    <Switch>
      <Match when={scalar() !== undefined}>
        <span class="break-all whitespace-normal">{scalar()}</span>
      </Match>
      <Match when={Array.isArray(props.value) || isRecord(props.value)}>
        <div>
          <Show when={isRecord(props.value) && isRecord(props.value.VisualState)}>
            <VisualPreview value={isRecord(props.value) ? props.value.VisualState : undefined} variant="detail" />
          </Show>
          <ul class="m-0 list-none p-0">
            <For each={entries()}>
              {([key, value]) => (
                <Show
                  when={key === 'visual' && isRecord(value)}
                  fallback={
                    <Show
                      when={formatJsonValue(value)}
                      fallback={
                        <Show
                          when={isHelpValue(value)}
                          fallback={<JsonGroup title={key} value={value} search={props.search} />}
                        >
                          <li>
                            <span class="text-[#f0640d]">{key}: </span>
                            <span>
                              {readHelpName(value)} (
                              <a
                                class="font-bold text-[#5db0d7] underline"
                                href={readHelp(value)}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Open help page
                              </a>
                              )
                            </span>
                          </li>
                        </Show>
                      }
                    >
                      {(formatted) => (
                        <li>
                          <span class="text-[#f0640d]">{key}: </span>
                          <span class="break-all whitespace-normal">{formatted()}</span>
                        </li>
                      )}
                    </Show>
                  }
                >
                  <For each={isRecord(value) ? Object.entries(value) : []}>
                    {([target, source]) => (
                      <Show when={typeof source === 'string' && source}>
                        <li class="mx-auto w-1/2">
                          <figure class="m-[5px] block w-full border border-[#606060]">
                            <img
                              class={`${checkerboardClass()} mx-auto block w-full max-w-64`}
                              src={String(source)}
                              alt={target}
                            />
                            <figcaption class="box-border inline-block w-full p-[5px] break-words">{target}</figcaption>
                          </figure>
                        </li>
                      </Show>
                    )}
                  </For>
                </Show>
              )}
            </For>
          </ul>
        </div>
      </Match>
    </Switch>
  );
}

function VisualPreview(props: { readonly value: unknown; readonly variant: 'list' | 'detail' }): JSX.Element {
  const visual = () => normalizeVisualState(props.value);
  const listLabel = () => listFramebufferLabel(props.value);
  const imageClass = () =>
    props.variant === 'list'
      ? `${checkerboardClass()} mx-auto block max-h-[600px] w-full object-contain`
      : `${checkerboardClass()} m-[5px] block max-h-[800px] w-full max-w-[512px] border border-[#606060] object-contain`;
  const labelClass = () =>
    props.variant === 'list'
      ? 'box-border inline-block w-full border-[5px] border-[#222] bg-[#222] p-[5px] break-words'
      : 'block';

  return (
    <div class={props.variant === 'detail' ? 'p-[10px] text-center' : ''}>
      <Show when={visual().attachments.length > 0} fallback={<span class={labelClass()}>{visual().status}</span>}>
        <For each={visual().attachments}>
          {(attachment) => (
            <Show when={attachment.src}>
              <img
                class={imageClass()}
                src={encodeURI(attachment.src ?? '')}
                alt={attachment.attachmentName ?? visual().framebufferLabel}
              />
              <Show when={visual().attachments.length > 1 && attachment.attachmentName}>
                <span class={labelClass()}>{attachment.attachmentName}</span>
              </Show>
              <Show when={attachment.textureLayer}>
                <span class={labelClass()}>Layer: {attachment.textureLayer}</span>
              </Show>
              <Show when={attachment.textureCubeMapFace}>
                <span class={labelClass()}>{attachment.textureCubeMapFace}</span>
              </Show>
            </Show>
          )}
        </For>
      </Show>
      <span class={labelClass()}>{props.variant === 'list' ? listLabel() : visual().framebufferLabel}</span>
    </div>
  );
}

function EmptyView(props: { readonly message: string }): JSX.Element {
  return <div class="grid h-full min-h-40 place-items-center p-8 text-center text-[#d9d9d9]">{props.message}</div>;
}

const HIDDEN_CAPTURE_KEYS = new Set(['analyserName', 'source', 'translatedSource']);

function tabButtonClass(active: boolean): string {
  return `block h-10 shrink-0 border-b-2 px-2 font-['Montserrat',sans-serif] text-[13px] font-light outline-none ${
    active
      ? 'border-[#f0640d] bg-[#222] font-normal text-white hover:text-[#f0640d]'
      : 'border-transparent bg-[#2c2c2c] text-[#ccc] hover:bg-[#222] hover:text-[#c9c9c9]'
  }`;
}

function commandRowClass(command: ICommandCapture, active: boolean, index: number): string {
  if (active) return 'bg-[#f37628] text-[#222]';
  if (command.VisualState) return 'bg-[#5db0d7] text-[#222]';
  return index % 2 === 0 ? 'bg-[#222]' : 'bg-[#2c2c2c]';
}

function commandNameClass(command: ICommandCapture): string {
  switch (commandStatusLabel(command.status)) {
    case 'Deprecated':
      return 'font-extrabold text-red-500';
    case 'Unused':
      return 'font-extrabold text-yellow-400';
    case 'Disabled':
      return 'font-extrabold text-gray-500';
    case 'Redundant':
      return 'font-extrabold text-orange-500';
    case 'Valid':
      return 'font-extrabold text-[#adff2f]';
    default:
      return 'font-extrabold';
  }
}

function commandTextTail(command: ICommandCapture): string {
  const text = String(command.text ?? '');
  return text.startsWith(command.name) ? text.slice(command.name.length) : `: ${text}`;
}

function activeCheckpointIndex(
  checkpoints: readonly SpectorVisualCheckpoint[],
  capture: ICapture | undefined,
  command: ICommandCapture | undefined
): number {
  if (!capture || !command) return 0;
  const commandIndex = capture.commands.indexOf(command);
  let activeIndex = 0;
  checkpoints.forEach((checkpoint, checkpointIndex) => {
    if (checkpoint.commandIndex <= commandIndex) activeIndex = checkpointIndex;
  });
  return activeIndex;
}

function activeCheckpoint(
  checkpoints: readonly SpectorVisualCheckpoint[],
  capture: ICapture,
  command: ICommandCapture
): SpectorVisualCheckpoint | undefined {
  return checkpoints[activeCheckpointIndex(checkpoints, capture, command)];
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function formatCaptureTime(capture: ICapture): string {
  return new Date(capture.startTime).toTimeString().split(' ')[0] ?? '';
}

function saveCapture(capture: ICapture): void {
  const blob = new Blob([JSON.stringify(capture, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `spector-${new Date(capture.startTime).toISOString().replaceAll(':', '-')}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function isCapture(value: unknown): value is ICapture {
  return isRecord(value) && Array.isArray(value.commands) && isRecord(value.canvas) && isRecord(value.context);
}

function isHelpValue(value: unknown): boolean {
  return isRecord(value) && typeof value.help === 'string';
}

function readHelp(value: unknown): string {
  return isRecord(value) && typeof value.help === 'string' ? value.help : '#';
}

function readHelpName(value: unknown): string {
  return isRecord(value) && typeof value.name === 'string' ? value.name : 'Open help page';
}

function formatJsonValue(value: unknown): string | undefined {
  const scalar = formatCapturedValue(value);
  if (scalar !== undefined) return scalar;
  if (!Array.isArray(value)) return undefined;
  if (value.length === 0) return 'Empty Array';

  const values = value.map(formatCapturedValue);
  return values.every((item) => item !== undefined) ? values.join(', ') : undefined;
}

function listFramebufferLabel(value: unknown): string {
  if (!isRecord(value) || !isRecord(value.FrameBuffer)) return 'Canvas frame buffer';
  const tag = value.FrameBuffer.__SPECTOR_Object_TAG;
  if (!isRecord(tag) || (typeof tag.id !== 'number' && typeof tag.id !== 'string')) return 'Canvas frame buffer';
  return `Frame buffer: ${tag.id}`;
}

function checkerboardClass(): string {
  return '[background-image:-webkit-gradient(linear,0_100%,100%_0,color-stop(.25,#c9c9c9),color-stop(.25,transparent)),-webkit-gradient(linear,0_0,100%_100%,color-stop(.25,#c9c9c9),color-stop(.25,transparent)),-webkit-gradient(linear,0_100%,100%_0,color-stop(.75,transparent),color-stop(.75,#c9c9c9)),-webkit-gradient(linear,0_0,100%_100%,color-stop(.75,transparent),color-stop(.75,#c9c9c9))] [background-position:0_0,25px_0,25px_-25px,0_25px] [background-size:50px_50px]';
}

function mdnCommandUrl(commandName: string): string {
  return `https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/${encodeURIComponent(commandName)}`;
}

function humanize(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replaceAll('_', ' ');
}

const ShaderEditor = lazy(() => import('./shader-editor'), { export: 'ShaderEditor' });
