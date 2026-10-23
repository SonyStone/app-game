import { createResizeObserver } from '@solid-primitives/resize-observer';
import type { JSX } from '@solidjs/web';
import { createSignal, Show } from 'solid-js';
import { ColorWheel, createColorWheelSettings } from '../../features/color-wheel';
import { createRecentColors } from '../../features/color/createRecentColors';
import { hsvToHex, type Hsv } from '../../features/color/hsv';
import { CoolorusWheel, defaultCoolorusSettings, type CoolorusSettings } from '../../features/coolorus-wheel';
import { HueTriangle } from '../../features/hue-triangle';
import type { PaintSession } from '../../features/session';
import { ColorPanel as DesktopColorPanel } from '../desktop/ColorPanel';
import desktop from '../desktop/DesktopStudio.module.css';
import { ColorsPopover, type ColorMode } from '../procreate/ColorsPopover';
import popover from '../procreate/Popover.module.css';
import procreate from '../procreate/ProcreateStudio.module.css';
import { ColorDisc } from '../zen/ColorDisc';
import type { Span } from './board';
import styles from './LegoStudio.module.css';
import type { LookSpec } from './looks';

/**
 * The color part's looks, smallest first: a swatch that opens a picker, or one of the library's pickers on the brush
 * color: Zen's disc, the hue triangle, the OKLCH wheel, Coolorus, Procreate's Colors and the Desktop color panel.
 * Every picker can also be what the swatch opens.
 */
export const colorLooks: readonly ColorLook[] = [
  { id: 'swatch', label: 'Swatch', min: { columns: 1, rows: 1 } },
  { id: 'disc', label: 'Zen disc', min: { columns: 2, rows: 2 }, width: 232, Picker: ZenDisc },
  { id: 'triangle', label: 'Triangle', min: { columns: 3, rows: 3 }, width: 236, Picker: Triangle },
  { id: 'wheel', label: 'OKLCH wheel', min: { columns: 4, rows: 5 }, width: 268, Picker: Wheel },
  { id: 'coolorus', label: 'Coolorus', min: { columns: 4, rows: 4 }, width: 240, Picker: Coolorus },
  {
    id: 'procreate',
    label: 'Procreate Colors',
    min: { columns: 6, rows: 8 },
    width: 340,
    ground: 'rgb(32 32 34)',
    Picker: Procreate
  },
  { id: 'desktop', label: 'Desktop panel', min: { columns: 5, rows: 5 }, width: 284, ground: '#1e1e1e', Picker: Desktop }
];

/**
 * A color look: `width` is a picker's natural width in CSS pixels, at which it lays itself out before being scaled
 * into a part, and `ground` the color around it there for a dark picker; the swatch has neither, since it fills its
 * part.
 */
type ColorLook = LookSpec & {
  width?: number;
  ground?: string;
  Picker?: (props: { session: PaintSession }) => JSX.Element;
};

/** The look a color part shows until the user chooses one: a swatch, and the Zen disc once 5×5 cells or larger. */
export function autoColorLook(span: Span) {
  return span.columns >= 5 && span.rows >= 5 ? 'disc' : 'swatch';
}

/** The looks the swatch can open, and the one it opens until the user chooses. */
export const colorPopups = colorLooks.filter((look) => look.Picker);
export const defaultColorPopup = 'disc';

/**
 * Picker look `look` on the session's brush color: at its natural size, or scaled to fit `box` (CSS pixels) and
 * centered in it, as a part shows it. Nothing for the swatch or an unknown look.
 */
export function ColorPicker(props: { look: string; session: PaintSession; box?: { width: number; height: number } }) {
  const look = () => colorLooks.find((candidate) => candidate.id === props.look && candidate.Picker);

  // Keyed: another look is another picker, with state of its own.
  return (
    <Show when={look()} keyed>
      {(found) => {
        const Picker = found.Picker!;
        const width = found.width ?? 0;
        return (
          <Show
            when={props.box}
            fallback={
              <div style={{ width: `${width}px` }}>
                <Picker session={props.session} />
              </div>
            }
          >
            {(box) => (
              <Fitted width={width} box={box()} ground={found.ground}>
                <Picker session={props.session} />
              </Fitted>
            )}
          </Show>
        );
      }}
    </Show>
  );
}

/** Paints in `color` (`#rrggbb` or HSV) from now on; the eraser gives way to the brush. */
export function setColor(session: PaintSession, color: string | Hsv) {
  if (session.tool() === 'eraser') {
    session.chooseTool('brush');
  }

  session.tools.updateBrush({ color: typeof color === 'string' ? color : hsvToHex(color) });
}

/**
 * `children` laid out `width` pixels wide and scaled, keeping proportions, to fit `box`; never more than half again
 * as large, where canvases would blur. The pickers read presses through their scaled bounding boxes, so they work
 * at any scale.
 */
function Fitted(props: {
  width: number;
  box: { width: number; height: number };
  ground?: string;
  children: JSX.Element;
}) {
  const [inner, setInner] = createSignal<HTMLElement>();
  const [height, setHeight] = createSignal(props.width);
  createResizeObserver(inner, (_rect, element) => setHeight(Math.max(1, (element as HTMLElement).offsetHeight)));
  const scale = () => Math.min(props.box.width / props.width, props.box.height / height(), 1.5);

  return (
    <div class={styles.fitted} style={{ background: props.ground }}>
      <div ref={setInner} style={{ width: `${props.width}px`, scale: `${scale()}` }}>
        {props.children}
      </div>
    </div>
  );
}

function ZenDisc(props: { session: PaintSession }) {
  const recent = createRecentColors();

  return (
    <div class={styles.pickerSurface}>
      <ColorDisc
        color={props.session.brush().color}
        onInput={(color) => setColor(props.session, color)}
        onCommit={recent.remember}
      />
    </div>
  );
}

function Triangle(props: { session: PaintSession }) {
  const recent = createRecentColors();

  return (
    <div class={styles.pickerSurface}>
      <HueTriangle
        color={props.session.brush().color}
        onChange={(color) => setColor(props.session, color)}
        onSettle={() => recent.remember(props.session.brush().color)}
      />
    </div>
  );
}

/** The OKLCH wheel with the harmony and gamut mask Paint keeps on this device. */
function Wheel(props: { session: PaintSession }) {
  const recent = createRecentColors();
  const settings = createColorWheelSettings();

  return (
    <div class={styles.pickerSurface}>
      <ColorWheel
        color={props.session.brush().color}
        onChange={(color) => setColor(props.session, color)}
        onSettle={() => recent.remember(props.session.brush().color)}
        settings={settings.settings()}
        onSettings={settings.update}
      />
    </div>
  );
}

function Coolorus(props: { session: PaintSession }) {
  const recent = createRecentColors();
  const [settings, setSettings] = createSignal<CoolorusSettings>(defaultCoolorusSettings);

  return (
    <div class={styles.pickerSurface}>
      <CoolorusWheel
        color={props.session.brush().color}
        onChange={(color) => setColor(props.session, color)}
        onSettle={() => recent.remember(props.session.brush().color)}
        settings={settings()}
        onSettings={(patch) => setSettings((current) => ({ ...current, ...patch }))}
      />
    </div>
  );
}

/** The Procreate variant's Colors popover, in its own dark tokens; Mixing opens the session's palette window. */
function Procreate(props: { session: PaintSession }) {
  const recent = createRecentColors();
  const [mode, setMode] = createSignal<ColorMode>('disc');
  const brush = () => props.session.brush();

  return (
    <div class={[procreate.editor, styles.procreateSurface]}>
      <div class={popover.body}>
        <ColorsPopover
          color={brush().color}
          secondary={brush().backgroundColor ?? '#ffffff'}
          recent={recent.colors()}
          mode={mode()}
          onMode={setMode}
          onInput={(color) => setColor(props.session, color)}
          onCommit={recent.remember}
          onSwap={props.session.tools.swapColors}
          mixing={props.session.windows.isOpen('palette')}
          onMixing={() => props.session.windows.toggle('palette')}
        />
      </div>
    </div>
  );
}

/** The Desktop variant's color panel, in its own dark tokens: foreground and background, square, sliders, recents. */
function Desktop(props: { session: PaintSession }) {
  const [target, setTarget] = createSignal<'color' | 'backgroundColor'>('color');
  const brush = () => props.session.brush();

  return (
    // Inline, as the variant's grid on `.editor` may load after this stylesheet.
    <div class={[desktop.editor, styles.desktopSurface]} style={{ display: 'block' }}>
      <DesktopColorPanel
        foreground={brush().color}
        background={brush().backgroundColor ?? '#ffffff'}
        target={target()}
        onTarget={setTarget}
        onChange={(patch) => {
          if (patch.color) {
            setColor(props.session, patch.color);
          }

          if (patch.backgroundColor) {
            props.session.tools.updateBrush({ backgroundColor: patch.backgroundColor });
          }
        }}
      />
    </div>
  );
}
