import { For, merge, Show } from 'solid-js';
import { SketchIcon, type SketchIconName } from '../../../shared/ui/SketchIcon';
import { BrushLibrary } from '../../procreate/BrushLibrary';
import type { Span } from '../board';
import { FileMenu } from '../FileMenu';
import { useGrid } from '../grid';
import type { LegoServices } from '../LegoServices';
import styles from '../LegoStudio.module.css';
import { anyRoom, lookFits, type LookSpec } from '../looks';
import { fitText, type TextStyle } from '../textFit';
import { definePart, type PartBinding, type PartGroup } from './definition';

/**
 * Symmetry's looks: the toggle, and with room for a list of the modes under it, wide enough for "Horizontal" and two
 * rows high, the toggle and that list. Declared before the definitions, which read it as they are made.
 */
const symmetryLooks: readonly LookSpec[] = [
  { id: 'button', label: 'Button', min: anyRoom },
  { id: 'modes', label: 'Modes', min: { width: 88, height: 56 } }
];

/** Single-command definitions. Each binding reads only the capability needed by its button. */
export const actionParts = [
  action('brush-editor', 'brush', 'Brush settings', 'sliders', (s, f) => ({ onPress: f.command(s.brushEditor.open) })),
  action('file', 'file', 'File', 'paper', () => ({}), {
    needs: (s, f) => ({
      get ready() {
        return s.files.ready();
      },
      import: f.command(s.files.import),
      download: f.command(s.files.download),
      png: f.command(s.files.png),
      psd: f.command(s.files.psd),
      place: f.command(s.files.place),
      options: f.command(s.options.open),
      onDone: f.onDone
    }),
    View: FileMenu
  }),
  action('brushes', 'brush', 'Brushes', 'brush', () => ({}), {
    needs: (s, f) => ({
      get presets() {
        return s.presets.listed();
      },
      own: {
        get deleting() {
          return s.presets.own.deleting();
        },
        rename: f.command(s.presets.own.rename),
        remove: f.command(s.presets.own.remove),
        undo: f.command(s.presets.own.undo)
      },
      get recent() {
        return s.presets.recent();
      },
      get preset() {
        return s.tools.preset();
      },
      get disabled() {
        return !s.layers.ready();
      },
      onImport: s.presets.openAbr && f.command(s.presets.openAbr),
      onImportFile: f.command(s.presets.importFile),
      onExportFile: f.command(s.presets.exportFile),
      onChoose: f.command(s.presets.use)
    }),
    View: (props) => (
      <section class={styles.brushesCard}>
        <BrushLibrary title="Brushes" sidebar {...props} />
      </section>
    )
  }),
  definePart({
    kind: 'action:symmetry',
    family: 'action',
    group: 'aids',
    section: 'Tools',
    label: 'Symmetry',
    icon: 'symmetry',
    looks: { looks: symmetryLooks, auto: (room) => (lookFits(symmetryLooks[1]!, room) ? 'modes' : 'button') },
    needs: (s, f) => ({
      get span() {
        return f.span;
      },
      get mode() {
        return s.symmetry.mode();
      },
      get disabled() {
        return !s.symmetry.canUpdate();
      },
      get showModes() {
        return f.look === 'modes';
      },
      onToggle: f.command(s.symmetry.toggle),
      onMode: f.command(s.symmetry.setMode)
    }),
    View: SymmetryPart
  }),
  // Opens the Options sheet, the editor's own settings, such as the grid size.
  action('options', 'interface', 'Options', 'options', (s, f) => ({ onPress: f.command(s.options.open) })),
  action('quickshape', 'aids', 'QuickShape', 'quickshape', (s, f) => ({
    get active() {
      return s.quickShape.enabled();
    },
    onPress: f.command(s.quickShape.toggle)
  })),
  // Opens the brush studio on its Pen page, the one place where pen pressure is measured and edited.
  action('pressure', 'pen', 'Pressure calibration', 'pressure', (s, f) => ({ onPress: f.command(s.pen.open) })),
  tool('eraser', 'Eraser', 'erase'),
  tool('lasso', 'Lasso', 'lasso'),
  tool('fill', 'Fill', 'fill'),
  action('transform', 'tools', 'Transform', 'move', (s, f) => ({
    get active() {
      return s.transform.active();
    },
    onPress: f.command(s.transform.toggle)
  })),
  action('undo', 'history', 'Undo', 'undo', (s, f) => ({
    get disabled() {
      return !s.history.canUndo();
    },
    onPress: f.command(s.history.undo)
  })),
  action('redo', 'history', 'Redo', 'redo', (s, f) => ({
    get disabled() {
      return !s.history.canRedo();
    },
    onPress: f.command(s.history.redo)
  })),
  tool('local-undo', 'Local undo', 'localUndo'),
  action('mixing', 'colors', 'Mixing', 'mixing', (s, f) => ({
    get active() {
      return s.windows.isOpen('palette');
    },
    onPress: f.command(() => s.windows.toggle('palette'))
  }))
];

/**
 * Controlled action look. Its callback owns command policy; the view only sizes and labels the button. Beside the
 * icon it names the action (or its status) when the name fits the room the button leaves it, the short name when only
 * that fits, and nothing otherwise.
 */
function ActionPart(props: {
  label: string;
  /** A shorter name, shown when the label does not fit. */
  short?: string;
  icon: SketchIconName;
  span: Span;
  active?: boolean;
  disabled?: boolean;
  onPress: (anchor: Element) => void;
  status?: string;
}) {
  const grid = useGrid();
  const name = () =>
    fitText(
      grid.length(props.span.columns) - actionChrome,
      actionNameStyle,
      props.status ?? props.label,
      props.status ? undefined : props.short
    );
  return (
    <button
      type="button"
      class={styles.action}
      data-active={props.active ? '' : undefined}
      disabled={props.disabled}
      aria-pressed={props.active === undefined ? undefined : props.active ? 'true' : 'false'}
      title={props.status ? `${props.label}: ${props.status}` : props.label}
      aria-label={props.label}
      onClick={(event) => props.onPress(event.currentTarget)}
    >
      <SketchIcon
        name={props.icon}
        size={Math.min(40, 20 + (Math.min(props.span.columns, props.span.rows) - 1) * 10)}
      />
      <Show when={name()}>{(shown) => <span class={styles.name}>{shown()}</span>}</Show>
    </button>
  );
}

/** How `.action` sets a name: its type, and the pixels its padding, the 20 px icon and the gap take beside it. */
const actionNameStyle: TextStyle = { size: 11, weight: 600, letterSpacing: -0.25 };
const actionChrome = 2 * 4 + 20 + 6;

/**
 * Shorter names of the actions whose names are long, shown where only these fit. No short name is another part's
 * name or short name, so two parts never show the same caption: Brush settings is "Settings", the editor's own
 * settings are "Options".
 */
export const shortNames: Readonly<Record<string, string>> = {
  'brush-editor': 'Settings',
  pressure: 'Pressure'
};

function action<N extends object, P extends object = N>(
  id: string,
  group: PartGroup,
  label: string,
  icon: SketchIconName,
  needs: (services: LegoServices, frame: PartBinding) => N,
  popup?: {
    needs: (services: LegoServices, frame: PartBinding) => P;
    View: (props: P) => ReturnType<typeof ActionPart>;
  }
) {
  return definePart({
    kind: `action:${id}`,
    family: 'action',
    group,
    section: 'Tools',
    label,
    icon,
    popup,
    needs: (services, frame) =>
      merge(
        {
          label,
          short: shortNames[id],
          icon,
          get span() {
            return frame.span;
          },
          onPress: (anchor: Element) => frame.onPopup(anchor, { kind: 'part', partKind: frame.kind })
        },
        needs(services, frame)
      ),
    View: ActionPart
  });
}

function tool(id: Parameters<LegoServices['tools']['toggle']>[0], label: string, icon: SketchIconName) {
  return action(id, 'tools', label, icon, (services, frame) => ({
    get active() {
      return services.tools.current() === id;
    },
    onPress: frame.command((anchor: Element) => {
      if (!services.tools.toggle(id)) {
        frame.onPopup(anchor, { kind: 'note', text: fillNote });
      }
    })
  }));
}

const fillNote = 'Fill paints inside a selection: circle an area with the lasso, then tap Fill and tap inside it.';

/** Compact toggle with a mode label; the larger look also chooses the symmetry axes. */
function SymmetryPart(props: {
  span: Span;
  mode: ReturnType<LegoServices['symmetry']['mode']>;
  showModes: boolean;
  /** Prevents native input changes while the session rejects document commands. */
  disabled: boolean;
  onToggle: () => void;
  onMode: LegoServices['symmetry']['setMode'];
}) {
  return (
    <div class={styles.symmetryPart} data-modes={props.showModes ? '' : undefined}>
      <ActionPart
        label="Symmetry"
        icon="symmetry"
        span={props.span}
        active={props.mode !== 'off'}
        disabled={props.disabled}
        status={
          props.mode === 'off' || props.showModes
            ? undefined
            : symmetryModes.find((mode) => mode.id === props.mode)?.label
        }
        onPress={props.onToggle}
      />
      <Show when={props.showModes}>
        <select
          aria-label="Paint symmetry mode"
          disabled={props.disabled}
          value={props.mode}
          onChange={(event) => {
            const mode = symmetryModes.find((mode) => mode.id === event.currentTarget.value);

            if (mode) {
              props.onMode(mode.id);
            }
          }}
        >
          <For each={symmetryModes} keyed={(mode) => mode.id}>
            {(mode) => <option value={mode().id}>{mode().label}</option>}
          </For>
        </select>
      </Show>
    </div>
  );
}

const symmetryModes = [
  { id: 'off', label: 'Off' },
  { id: 'vertical', label: 'Vertical' },
  { id: 'horizontal', label: 'Horizontal' },
  { id: 'dual', label: 'Dual axis' },
  { id: 'diagonal', label: 'Diagonal' },
  { id: 'radial', label: 'Radial' },
  { id: 'mandala', label: 'Mandala' }
] as const;
