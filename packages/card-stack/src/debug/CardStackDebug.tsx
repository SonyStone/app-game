import { Button } from '@app-game/components/ui/button';
import { Checkbox } from '@app-game/components/ui/checkbox';
import { Select } from '@app-game/components/ui/select';
import { Slider } from '@app-game/components/ui/slider';
import { TextFieldInput } from '@app-game/components/ui/text-field';
import { Popover, PopoverTrigger, PopoverContent } from '@app-game/components/ui/popover';
import { createInspectorSetting, validMotionSelection, resolveElementLayers, type MotionSelection } from './createInspectorSetting';
import { createMemo, createSignal, For, onCleanup, Show, type Accessor } from 'solid-js';
import { createCardStackRecording } from './createCardStackRecording';
import { collectMotionTracks, largestMotionStep, nearestMotionFrame, type StackCapture } from './motionView';
import { MotionPlot } from './MotionPlot';
import styles from './CardStackDebug.module.css';

/** In-page inspector for one deck, with live previews and captured-frame inspection. */
export function CardStackDebug(props: { target: Accessor<HTMLElement | undefined>; label: string }) {
  const scope = `${typeof location === 'undefined' ? '' : location.pathname}:${props.label}`;
  const boolean = (value: unknown) => typeof value === 'boolean';
  const range = (min: number, max: number) => (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
  const [elementsOpen, setElementsOpen] = createSignal(false);
  const recorder = createCardStackRecording(props.target);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [duration, setDuration] = createInspectorSetting(scope, 'duration', 5, range(1, 60));
  const [delay, setDelay] = createInspectorSetting(scope, 'delay', 0, range(0, 60));
  const [autoStop, setAutoStop] = createInspectorSetting(scope, 'autoStop', true, boolean);
  const busy = () => recorder.status() === 'recording' || recorder.status() === 'scheduled';
  const [dock, setDock] = createInspectorSetting<'right' | 'bottom'>(scope, 'dock', typeof window !== 'undefined' && window.innerWidth < 800 ? 'bottom' : 'right', value => value === 'right' || value === 'bottom');
  const [selected, setSelected] = createInspectorSetting<string | null>(scope, 'focusedElement', null, value => value === null || typeof value === 'string');
  const [selection, setSelection] = createInspectorSetting<MotionSelection>(scope, 'elements', null, validMotionSelection);
  const [fitMotion, setFitMotion] = createInspectorSetting(scope, 'fitMotion', true, boolean);
  const [cursor, setCursor] = createSignal<number>();
  const [selectedEvent, setSelectedEvent] = createSignal<StackCapture['events'][number]>();
  const [showPointer, setShowPointer] = createInspectorSetting(scope, 'showPointer', true, boolean);
  const [occlusion, setOcclusion] = createInspectorSetting(scope, 'occlusion', true, boolean);
  const [onion, setOnion] = createInspectorSetting(scope, 'onion', true, boolean);
  const [trajectory, setTrajectory] = createInspectorSetting(scope, 'trajectory', true, boolean);
  const [ghosts, setGhosts] = createInspectorSetting(scope, 'ghosts', 10, range(2, 20));
  const [windowMs, setWindowMs] = createInspectorSetting(scope, 'windowMs', 0, value => [0, 250, 500, 1000].includes(Number(value)) && typeof value === 'number');
  const [includeHidden, setIncludeHidden] = createInspectorSetting(scope, 'includeHidden', false, boolean);
  const frames = () => recorder.capture()?.frames ?? recorder.preview();
  const events = () => recorder.capture()?.events ?? recorder.previewEvents();
  const pointerEvents = createMemo(() => events().filter((event) => event.data.pointer));
  const inputEvent = () => selectedEvent() ?? pointerEvents().filter((event) => event.t <= (frame()?.t ?? 0)).at(-1);
  const eventPercent = (t: number) => Math.max(0, Math.min(100, (t - (frames()[0]?.t ?? 0)) / Math.max(1, (frames().at(-1)?.t ?? 0) - (frames()[0]?.t ?? 0)) * 100));
  const tracks = createMemo(() => collectMotionTracks(frames()));
  const defaultTrack = createMemo(() => tracks().filter((item) => item.part === 'tab' && item.representation === 'live').sort((a, b) => b.travel - a.travel)[0] ?? tracks()[0]);
  const track = createMemo(() => tracks().find(item => item.key === selected()) ?? defaultTrack());
  const choices = createMemo(() => {
    const saved = selection();
    return saved ? Object.fromEntries(Object.entries(saved).map(([key, value]) => [key, resolveElementLayers(value)])) :
      Object.fromEntries(tracks().map(item => [item.key, { visible: item.part === 'tab' && item.representation === 'live', onion: item.key === defaultTrack()?.key, trajectory: item.key === defaultTrack()?.key }]));
  });
  const layers = createMemo(() => tracks().map(item => ({ ...item, visible: !!choices()[item.key]?.visible, onion: onion() && !!choices()[item.key]?.onion, trajectory: trajectory() && !!choices()[item.key]?.trajectory })).filter(item => item.visible || item.onion || item.trajectory));
  const chosenCount = () => tracks().filter(item => choices()[item.key]?.visible || choices()[item.key]?.onion || choices()[item.key]?.trajectory).length;
  const index = () => Math.min(Math.max(0, frames().length - 1), recorder.status() === 'recording' ? Math.max(0, frames().length - 1) : cursor() ?? largestMotionStep(track()?.points ?? []));
  const frame = () => frames()[index()];
  const pose = () => track()?.points.find((point) => point.frame === index());
  const previous = () => track()?.points.find((point) => point.frame === index() - 1);
  const time = (t: number) => Math.round(t - (frames()[0]?.t ?? 0));
  const urls = new Set<string>();
  let svg: SVGSVGElement | undefined;
  onCleanup(() => urls.forEach((url) => URL.revokeObjectURL(url)));

  return (
    <section class={styles.panel} data-motion-debug="" data-state={recorder.status()} data-dock={dock()} aria-label={`Motion inspector: ${props.label}`}>
      <div class={styles.actions}>
        <Show when={busy()} fallback={
          <Button variant="ghost" size="sm" type="button" class={styles.primary} onClick={start} disabled={!props.target()}><i class={styles.recordDot} />Record</Button>
        }><Button variant="ghost" size="sm" type="button" class={styles.primary} onClick={() => recorder.freeze()}>{recorder.status() === 'scheduled' ? 'Cancel' : 'Stop'}</Button></Show>
        <Button variant="ghost" size="sm" type="button" onClick={exportSvg} disabled={!frames().length} title="Export SVG" aria-label="Export SVG">SVG</Button>
        <Button variant="ghost" size="sm" type="button" onClick={exportJson} disabled={!recorder.capture()} title="Export JSON" aria-label="Export JSON">JSON</Button>
        <Popover open={settingsOpen()} onOpenChange={setSettingsOpen} placement="bottom-start">
          <PopoverTrigger type="button" aria-label="Recording settings">Settings</PopoverTrigger>
          <PopoverContent initialFocus class={[styles.controlSurface, styles.settings]} aria-label="Recording settings">
          <fieldset disabled={busy()}>
            <label>Max duration <span><TextFieldInput aria-label="Maximum recording duration" type="number" min="1" max="60" step="1" value={duration()} onChange={(event) => { const value = seconds(event.currentTarget.valueAsNumber, 5, 1); setDuration(value); event.currentTarget.value = String(value); }} /> s</span></label>
            <label>Start delay <span><TextFieldInput aria-label="Recording start delay" type="number" min="0" max="60" step="1" value={delay()} onChange={(event) => { const value = seconds(event.currentTarget.valueAsNumber, 0, 0); setDelay(value); event.currentTarget.value = String(value); }} /> s</span></label>
            <Checkbox checked={autoStop()} onChange={(event) => setAutoStop(event.currentTarget.checked)}>Auto-stop</Checkbox>
            <small>{autoStop() ? `Stops after ${duration()} s.` : `Keeps the latest ${duration()} s until Stop.`}</small>
          </fieldset>
          </PopoverContent>
        </Popover>
        <Show when={recorder.status() === 'scheduled'} fallback={<output aria-live="off">{(recorder.summary().duration / 1000).toFixed(1)} s · {recorder.summary().samples} samples</output>}><output role="status" data-recording-countdown="">Starting in {recorder.countdown()} s</output></Show>
        <div class={styles.docking} role="group" aria-label="Dock position">
          <Button variant="ghost" size="sm" type="button" title="Dock to right" aria-label="Dock to right" aria-pressed={dock() === 'right' ? 'true' : 'false'} onClick={() => changeDock('right')}><span class={styles.dockIcon} data-side="right" /></Button>
          <Button variant="ghost" size="sm" type="button" title="Dock to bottom" aria-label="Dock to bottom" aria-pressed={dock() === 'bottom' ? 'true' : 'false'} onClick={() => changeDock('bottom')}><span class={styles.dockIcon} data-side="bottom" /></Button>
        </div>
      </div>
      <div class={styles.selectors}>
        <Popover open={elementsOpen()} onOpenChange={value => { setElementsOpen(value); if (value) setSettingsOpen(false); }}>
          <PopoverTrigger type="button" class={styles.elementPicker} aria-label="Tracked elements" disabled={!tracks().length}>Elements · {chosenCount()} ▾</PopoverTrigger>
          <PopoverContent initialFocus class={[styles.controlSurface, styles.elementMenu]} aria-label="Element overlays">
          <div class={styles.elementMenuActions}><Button variant="ghost" size="sm" type="button" onClick={() => setSelection(Object.fromEntries(tracks().map(item => [item.key, { visible: true, onion: true, trajectory: true }])))}>All</Button><Button variant="ghost" size="sm" type="button" onClick={() => setSelection({})}>None</Button></div>
          <div class={styles.elementRow}><span>Element</span><span>Visible</span><span>Onion</span><span>Trajectory</span></div>
          <For each={tracks()}>{(item) => <div class={styles.elementRow}>
            <Button variant="ghost" size="sm" type="button" title="Show position and measurements" aria-pressed={track()?.key === item.key ? 'true' : 'false'} onClick={() => setSelected(item.key)}>{item.label}</Button>
            <Checkbox aria-label={`${item.label} visible`} checked={!!choices()[item.key]?.visible} onChange={(event) => toggleElement(item.key, 'visible', event.currentTarget.checked)} />
            <Checkbox aria-label={`${item.label} onion skin`} checked={!!choices()[item.key]?.onion} onChange={(event) => toggleElement(item.key, 'onion', event.currentTarget.checked)} />
            <Checkbox aria-label={`${item.label} trajectory`} checked={!!choices()[item.key]?.trajectory} onChange={(event) => toggleElement(item.key, 'trajectory', event.currentTarget.checked)} />
          </div>}</For>
          </PopoverContent>
        </Popover>
        <div class={styles.trailPicker}><Select aria-label="Trail window" value={String(windowMs())} onChange={value => setWindowMs(Number(value))} options={[{ value: '0', label: 'All time' }, { value: '1000', label: '1 second' }, { value: '500', label: '500 ms' }, { value: '250', label: '250 ms' }]} /></div>

        <Checkbox title="Opaque surfaces in recorded stacking order" checked={occlusion()} onChange={(event) => setOcclusion(event.currentTarget.checked)}>Occlusion</Checkbox>
        <Checkbox checked={onion()} onChange={(event) => setOnion(event.currentTarget.checked)}>Onion skin</Checkbox>
        <Checkbox checked={trajectory()} onChange={(event) => setTrajectory(event.currentTarget.checked)}>Trajectory</Checkbox>
        <Checkbox checked={showPointer()} onChange={(event) => setShowPointer(event.currentTarget.checked)}>Pointer</Checkbox>
        <Checkbox aria-label="Include hidden" checked={includeHidden()} onChange={(event) => setIncludeHidden(event.currentTarget.checked)}>Hidden</Checkbox>
        <label>Ghosts <Slider aria-label="Ghost count" min="2" max="20" step="1" value={ghosts()} onInput={(event) => setGhosts(Number(event.currentTarget.value))} /><output>{ghosts()}</output></label>
      </div>
      <MotionPlot occlusion={occlusion()} tracks={layers()} fitMotion={fitMotion()} onFitMotion={setFitMotion} events={events()} pointer={showPointer()} selectedEvent={inputEvent()} frames={frames()} points={track()?.points ?? []} index={index()} ghosts={ghosts()} windowMs={windowMs()} includeHidden={includeHidden()} onSvg={(element) => { svg = element; }} />
      <div>
        <div class={styles.pointerLane}>
          <span>Pointer</span>
          <svg data-pointer-timeline="" viewBox="0 0 1000 22" preserveAspectRatio="none" role="img" aria-label="Pointer events over time; choose an event using Recorded event" onClick={(event) => {
            if (recorder.status() !== 'captured' || !showPointer() || !pointerEvents().length) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            const percent = (event.clientX - bounds.left) / bounds.width * 100;
            const nearest = pointerEvents().reduce((a, b) => Math.abs(eventPercent(a.t) - percent) < Math.abs(eventPercent(b.t) - percent) ? a : b);
            seekEvent(nearest);
          }}>
            <Show when={showPointer() && pointerEvents().length}>
            <For each={pointerEvents()}>{(event) => <line x1={eventPercent(event.t) * 10} x2={eventPercent(event.t) * 10} y1={event.data.type === 'pointermove' ? 10 : 3} y2="19" stroke={event.data.type === 'pointercancel' ? '#f28b82' : '#d7aefb'} stroke-opacity={event.data.type === 'pointermove' ? '.35' : '1'} stroke-width={event.data.type === 'pointermove' ? '1' : '3'}><title>{time(event.t)} ms · {event.data.type} · {event.data.receiver?.label}</title></line>}</For>
            <line x1={eventPercent(inputEvent()?.t ?? frame()?.t ?? 0) * 10} x2={eventPercent(inputEvent()?.t ?? frame()?.t ?? 0) * 10} y1="0" y2="22" stroke="#81c995" stroke-width="2" />
            </Show>
          </svg>
        </div>
      <div class={styles.timeline}>
        <div class={styles.scrubber}>
          <Button variant="ghost" size="sm" type="button" aria-label="Previous sample" disabled={recorder.status() !== 'captured' || index() === 0} onClick={() => seekFrame(index() - 1)}>←</Button>
          <Slider aria-label="Recorded sample" min="0" max={Math.max(0, frames().length - 1)} step="1" value={index()} disabled={recorder.status() !== 'captured'} onInput={(event) => seekFrame(Number(event.currentTarget.value))} />
          <Button variant="ghost" size="sm" type="button" aria-label="Next sample" disabled={recorder.status() !== 'captured' || index() >= frames().length - 1} onClick={() => seekFrame(index() + 1)}>→</Button>
          <output data-motion-time="">{frame() ? `${time(frame()!.t)} ms · ${index() + 1}/${frames().length}` : '0 ms'}</output>
        </div>
        <div class={styles.eventPicker}><Select aria-label="Recorded event" placeholder="Event" value={selectedEvent() ? String(events().indexOf(selectedEvent()!)) : ''} disabled={recorder.status() !== 'captured' || !events().length} onChange={value => seekEvent(events()[Number(value)]!)} options={events().map((event, i) => ({ value: String(i), label: `${time(event.t)} ms · ${event.data.type}${event.data.receiver ? ` · ${event.data.receiver.label}` : event.data.itemId ? ` · ${event.data.itemId}` : ''}` }))} /></div>
      </div>
      <div class={styles.readout} data-pointer-readout="" aria-live="off">
        <Show when={showPointer() && inputEvent()?.data.pointer} fallback={<span>Pointer · {showPointer() ? '—' : 'Off'}</span>}>
        <span><strong>{inputEvent()!.data.type}</strong> {time(inputEvent()!.t)} ms</span>
        <span>Target <strong>{inputEvent()!.data.receiver?.label}</strong></span>
        <span>Hit <strong>{inputEvent()!.data.hit?.label}</strong></span>
        <span>{inputEvent()!.data.pointer?.pointerType} #{inputEvent()!.data.pointer?.id} · buttons {inputEvent()!.data.pointer?.buttons}</span>
        <span>x {inputEvent()!.data.pointer?.rootX.toFixed(1)} · y {inputEvent()!.data.pointer?.rootY.toFixed(1)}</span>
        </Show>
      </div>
      </div>
      <div class={styles.readout} data-motion-readout="" aria-live="off">
        <span>{track()?.label}</span>
        <Show when={pose()} fallback={<span>{frames().length ? 'Absent' : '—'}</span>}>{(point) => <>
          <span title="Parent card stacking level">z <strong>{point().element.paint.cardZ}</strong></span>
          <span>x <strong>{point().element.x.toFixed(1)}</strong> px</span><span>y <strong>{point().element.y.toFixed(1)}</strong> px</span>
          <Show when={previous()}>{(before) => <>
            <span>Δx <strong>{(point().element.x - before().element.x).toFixed(1)}</strong></span><span>Δy <strong>{(point().element.y - before().element.y).toFixed(1)}</strong></span><span>Δt <strong>{(point().t - before().t).toFixed(1)}</strong> ms</span>
          </>}</Show>
          <span>{point().element.phase} · {point().element.visibility}</span>
        </>}</Show>
      </div>
    </section>
  );

  /** Capture before resizing the live deck so one take keeps its original layout. */
  function changeDock(position: 'right' | 'bottom') {
    if (position === dock()) return;
    recorder.freeze('dock-changed');
    setDock(position);
  }

  function seekFrame(index: number) {
    setSelectedEvent(undefined);
    setCursor(index);
  }

  function seekEvent(event: StackCapture['events'][number]) {
    setSelectedEvent(event);
    setCursor(nearestMotionFrame(frames(), event.t));
    const target = tracks().find(item => item.instance === event.data.receiver?.instance);
    if (target) setSelected(target.key);
  }

  function toggleElement(key: string, layer: 'visible' | 'onion' | 'trajectory', enabled: boolean) {
    setSelection({ ...choices(), [key]: { visible: !!choices()[key]?.visible, onion: !!choices()[key]?.onion, trajectory: !!choices()[key]?.trajectory, [layer]: enabled } });
  }

  function start() {
    setSelectedEvent(undefined);
    setCursor(undefined);
    setSettingsOpen(false);
    setElementsOpen(false);
    recorder.start({ durationMs: duration() * 1000, delayMs: delay() * 1000, autoStop: autoStop() });
  }

  function exportJson() {
    const capture = recorder.capture();
    if (capture) download(JSON.stringify({ ...capture, source: 'card-stack', label: props.label, measurement: 'dom-raf', coordinates: 'viewport-css-pixels-relative-to-root' }), 'application/json', 'json');
  }

  function exportSvg() {
    if (!svg) return;
    const copy = svg.cloneNode(true) as SVGSVGElement;
    copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    download(new XMLSerializer().serializeToString(copy), 'image/svg+xml', 'svg');
  }

  function download(content: string, type: string, extension: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    urls.add(url);
    const link = document.createElement('a');
    link.href = url;
    link.download = `notebook-motion-${Date.now()}.${extension}`;
    link.click();
  }
}

function seconds(value: number, fallback: number, minimum: number) {
  return Number.isFinite(value) ? Math.max(minimum, Math.min(60, Math.round(value))) : fallback;
}
