import { createDragSensor } from 'solid-dnd';
import { type JSX } from 'solid-js';

// ============================================================================
// MARK: DragFixture — tests createDragSensor in a real browser
// ============================================================================

export default function DragFixture(): JSX.Element {
  const sensor = createDragSensor({
    threshold: 8,
    onClick: () => {
      // Expose click events for testing
      const el = document.querySelector('[data-testid="last-event"]');
      if (el) el.textContent = 'click';
    },
    onDragStart: (e) => {
      const el = document.querySelector('[data-testid="last-event"]');
      if (el) el.textContent = `drag-start:${e.position.x.toFixed(0)},${e.position.y.toFixed(0)}`;
    },
    onDragMove: (e) => {
      const el = document.querySelector('[data-testid="drag-delta"]');
      if (el) el.textContent = `${e.delta.x.toFixed(0)},${e.delta.y.toFixed(0)}`;
    },
    onDragEnd: (e) => {
      const el = document.querySelector('[data-testid="last-event"]');
      if (el) el.textContent = `drag-end:${e.delta.x.toFixed(0)},${e.delta.y.toFixed(0)}`;
    },
    onDragCancel: () => {
      const el = document.querySelector('[data-testid="last-event"]');
      if (el) el.textContent = 'drag-cancel';
    }
  });

  return (
    <div data-fixture="drag">
      {/* State readouts */}
      <div style={{ display: 'flex', gap: '16px', 'margin-bottom': '12px', 'font-size': '13px' }}>
        <div>
          isDragging: <span data-testid="is-dragging">{sensor.isDragging() ? 'true' : 'false'}</span>
        </div>
        <div>
          position:{' '}
          <span data-testid="drag-position">
            {sensor.position() ? `${sensor.position()!.x.toFixed(0)},${sensor.position()!.y.toFixed(0)}` : 'null'}
          </span>
        </div>
        <div>
          delta:{' '}
          <span data-testid="drag-delta">
            {sensor.delta() ? `${sensor.delta()!.x.toFixed(0)},${sensor.delta()!.y.toFixed(0)}` : 'null'}
          </span>
        </div>
        <div>
          pointerType: <span data-testid="pointer-type">{sensor.pointerType()}</span>
        </div>
        <div>
          lastEvent: <span data-testid="last-event">none</span>
        </div>
      </div>

      {/* Draggable element */}
      <div
        data-testid="drag-handle"
        onPointerDown={sensor.onPointerDown}
        style={{
          width: '200px',
          height: '80px',
          background: '#3498db',
          'border-radius': '8px',
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
          color: 'white',
          'font-weight': 'bold',
          cursor: 'grab',
          'user-select': 'none',
          'touch-action': 'none'
        }}
      >
        Drag me
      </div>
    </div>
  );
}
