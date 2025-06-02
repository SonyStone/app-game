import { Mat2x3 } from '@packages/math/m2x3';
import { createStruct } from '@packages/math/utils/create-struct';
import { WindowEventListener } from '@solid-primitives/event-listener';
import { createKeyHold } from '@solid-primitives/keyboard';
import { createEffect, createMemo, createSignal, onMount, untrack } from 'solid-js';
import { ColorWheelPanel } from './components/color-wheel-panel';
import { LayersPanel } from './components/layers-panel';
import { NavigationPopup } from './components/navigation-popup';
import { ToolSelectPanel } from './components/tool-select-panel';
import { ToolSettingsPanel } from './components/tool-settings-panel';

export default function PaintUIExample() {
  const [isOpen, setIsOpen] = (() => {
    const [isOpen, setIsOpen] = createSignal(false);
    const pressing = createKeyHold(' ', { preventDefault: false });
    createEffect(() => {
      if (pressing()) {
        setIsOpen(true);
      } else {
        setIsOpen(false);
      }
    });
    return [isOpen, setIsOpen];
  })();

  const [position, setPosition, position2] = (() => {
    const [position, setPosition] = createSignal({ x: 0, y: 0 });

    const pos = createMemo<{ x: number; y: number }>((prev = { x: 0, y: 0 }) => {
      if (untrack(position) && isOpen()) {
        return untrack(position);
      }
      return prev;
    });

    return [pos, setPosition, position];
  })();

  let popup: HTMLElement;

  const [struct] = createStruct({
    canvas: [Mat2x3, Float32Array]
  });

  struct.canvas.identity();

  onMount(() => {
    struct.canvas.value[Mat2x3.M02] = window.innerWidth / 2;
    struct.canvas.value[Mat2x3.M12] = window.innerHeight / 2;
  });

  const [zoom, setZoom] = createSignal(1);
  const [rotation, setRotation] = createSignal(0);
  const [positionDelta, setPositionDelta] = createSignal({ x: 0, y: 0 });

  const canvas = createMemo(
    () => {
      const { x, y } = positionDelta();

      struct.canvas.value[Mat2x3.M02] = x;
      struct.canvas.value[Mat2x3.M12] = y;

      return struct.canvas;
    },
    struct.canvas,
    { equals: false }
  );

  return (
    <>
      <WindowEventListener
        onPointermove={(e) => {
          setPosition({ x: e.clientX, y: e.clientY });
        }}
        onContextmenu={(e) => {
          e.preventDefault();
        }}
        onmousedown={(e) => {
          // right click
          if (e.button === 2) {
            if (isOpen()) {
              setIsOpen(false);
            } else {
              setIsOpen(true);
            }
          }
          //  left click
          if (e.button === 0) {
            if (!popup.contains(e.target as HTMLElement)) {
              setIsOpen(false);
            }
          }
        }}
      />
      <div class="transform-origin-center transform-scale-100 flex h-full w-full touch-none select-none overflow-hidden">
        <NavigationPopup isActive />

        <div
          style={{
            transform: canvas().toCssMatrix() + `scale(${(zoom(), zoom())})` + `rotate(${rotation()}deg)`
          }}
        >
          <pre>
            position {position2().x.toFixed(2)} {position2().y.toFixed(2)}
            {}
            \n
            {}
            zoom {zoom().toFixed(2)}
            {}
            \n
            {}
            rotation {rotation().toFixed(2)}
            {}
          </pre>
        </div>

        {/* with svg */}
        <div
          ref={(ref) => {
            popup = ref;
          }}
          class={[
            isOpen() ? 'active opacity-100' : 'opacity-0',
            'pointer-events-none fixed left-0 top-0 transition-opacity'
          ].join(' ')}
          style={{ transform: `translate(${position().x - 60}px, ${position().y - 60}px)` }}
        >
          <NavigationPopupWithSVG
            isActive={isOpen()}
            zoomDelta={(val) => setZoom(val)}
            rotationDelta={(val) => setRotation(val)}
            positionDelta={(val) => setPositionDelta(val)}
            navigationIsActive={(val) => setIsOpen(!val)}
          />
        </div>
      </div>
    </>
  );
}

const NavigationPopupWithSVG = (props: {
  x?: number;
  y?: number;
  radius?: number;
  thickness?: number;
  horizontalMove?: number;
  gap?: number;
  stroke?: boolean;
  isActive?: boolean;
  zoomDelta?: (value: number) => void;
  rotationDelta?: (value: number) => void;
  positionDelta?: (value: { x: number; y: number }) => void;
  navigationIsActive?: (value: boolean) => void;
}) => {
  return (
    <div class="relative flex select-none drop-shadow-lg">
      <NavigationPopup {...props} />

      <ToolSelectPanel isActive={props.isActive} />

      <ColorWheelPanel isActive={props.isActive} />

      <LayersPanel isActive={props.isActive} />

      <ToolSettingsPanel isActive={props.isActive} />
    </div>
  );
};
