import { createDragSensor } from 'solid-dnd';
import { Show, type JSX } from 'solid-js';
import { DebugOverlay } from '../components/DebugOverlay';
import EventLog, { createEventLogger } from '../components/EventLog';
import { StateCard } from '../components/StateCard';

// ============================================================================
// MARK: Sensor Demo
// ============================================================================

export default function SensorDemo(): JSX.Element {
  const logger = createEventLogger();

  const sensor = createDragSensor({
    threshold: 8,
    onDragStart: (e) =>
      logger.addLog(
        `▶ START  origin=(${e.origin.x.toFixed(0)}, ${e.origin.y.toFixed(0)})  pos=(${e.position.x.toFixed(0)}, ${e.position.y.toFixed(0)})  pointer=${e.pointerEvent.pointerType}`
      ),
    onDragMove: (e) =>
      logger.addLog(
        `→ MOVE   pos=(${e.position.x.toFixed(0)}, ${e.position.y.toFixed(0)})  Δ=(${e.delta.x.toFixed(0)}, ${e.delta.y.toFixed(0)})`
      ),
    onDragEnd: (e) =>
      logger.addLog(
        `■ END    pos=(${e.position.x.toFixed(0)}, ${e.position.y.toFixed(0)})  Δ=(${e.delta.x.toFixed(0)}, ${e.delta.y.toFixed(0)})`
      ),
    onDragCancel: () => logger.addLog('✕ CANCEL')
  });

  return (
    <div class="flex flex-col gap-6">
      <div>
        <h2 class="mb-1 text-sm font-semibold text-neutral-300">createDragSensor</h2>
        <p class="mb-4 text-xs text-neutral-500">
          Grab the box and drag it around. The sensor tracks pointer movement, applies an 8px threshold, and reports
          events. Press <kbd class="rounded bg-white/10 px-1">Esc</kbd> to cancel.
        </p>
      </div>

      {/* ── Drag area ────────────────────────────────────────────────── */}
      <div class="relative h-80 overflow-hidden rounded-xl border border-white/10 bg-white/2">
        <div
          onPointerDown={sensor.onPointerDown}
          class={`absolute flex h-20 w-20 cursor-grab touch-none items-center justify-center rounded-xl border text-xs font-bold transition-shadow select-none ${
            sensor.isDragging()
              ? 'z-10 cursor-grabbing border-blue-400 bg-blue-600/30 shadow-lg shadow-blue-500/20'
              : 'border-white/20 bg-white/10 hover:border-white/30'
          }`}
          style={{
            transform: `translate(${sensor.delta()?.x ?? 0}px, ${sensor.delta()?.y ?? 0}px)`,
            left: `140px`,
            top: `120px`
          }}
        >
          <Show when={sensor.isDragging()} fallback="Grab me">
            Dragging!
          </Show>
        </div>
      </div>

      {/* ── Screen-space debug overlay ────────────────────────────── */}
      <DebugOverlay position={sensor.position()} isDragging={sensor.isDragging()} />

      {/* ── State readout ─────────────────────────────────────────── */}
      <div class="grid grid-cols-3 gap-3">
        <StateCard label="isDragging" value={sensor.isDragging() ? 'true' : 'false'} active={sensor.isDragging()} />
        <StateCard
          label="position"
          value={sensor.position() ? `${sensor.position()!.x.toFixed(0)}, ${sensor.position()!.y.toFixed(0)}` : 'null'}
        />
        <StateCard
          label="delta"
          value={sensor.delta() ? `${sensor.delta()!.x.toFixed(0)}, ${sensor.delta()!.y.toFixed(0)}` : 'null'}
        />
      </div>

      {/* ── Event log ─────────────────────────────────────────────── */}
      <EventLog logger={logger} />
    </div>
  );
}
