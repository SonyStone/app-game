import { For, merge, Show } from 'solid-js';
import { LayersPanel } from '../../../features/layers';
import { SketchIcon, type SketchIconName } from '../../../shared/ui/SketchIcon';
import { BrushLibrary } from '../../procreate/BrushLibrary';
import popover from '../../procreate/Popover.module.css';
import procreate from '../../procreate/ProcreateStudio.module.css';
import type { Span } from '../board';
import { FileMenu } from '../FileMenu';
import type { LegoServices } from '../LegoServices';
import styles from '../LegoStudio.module.css';
import { definePart, type PartBinding } from './definition';

/** Single-command definitions. Each binding reads only the capability needed by its button. */
export const actionParts = [
  action('file', 'File', 'paper', () => ({}), {
    needs: (s, f) => ({
      get ready() {
        return s.files.ready();
      },
      import: f.command(s.files.import),
      download: f.command(s.files.download),
      png: f.command(s.files.png),
      psd: f.command(s.files.psd),
      place: f.command(s.files.place),
      onDone: f.onDone
    }),
    View: FileMenu
  }),
  action('brushes', 'Brushes', 'brush', () => ({}), {
    needs: (s, f) => ({
      get presets() {
        return s.presets.all();
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
      onChoose: f.command(s.presets.use)
    }),
    View: (props) => (
      <div class={procreate.editor}>
        <section class={[popover.popover, styles.brushesCard]}>
          <div class={popover.body}>
            <BrushLibrary title="Brushes" {...props} />
          </div>
        </section>
      </div>
    )
  }),
  definePart({
    kind: 'action:symmetry',
    family: 'action',
    section: 'Tools',
    label: 'Symmetry',
    icon: 'symmetry',
    looks: {
      looks: [
        { id: 'button', label: 'Button', min: { columns: 1, rows: 1 } },
        { id: 'modes', label: 'Modes', min: { columns: 2, rows: 2 } }
      ],
      auto: (span) => (span.columns >= 2 && span.rows >= 2 ? 'modes' : 'button')
    },
    needs: (s, f) => ({
      get span() {
        return f.span;
      },
      get mode() {
        return s.symmetry.mode();
      },
      get showModes() {
        return f.look === 'modes';
      },
      onToggle: f.command(s.symmetry.toggle),
      onMode: f.command(s.symmetry.setMode)
    }),
    View: SymmetryPart
  }),
  action('quickshape', 'QuickShape', 'quickshape', (s, f) => ({
    get active() {
      return s.quickShape.enabled();
    },
    onPress: f.command(s.quickShape.toggle)
  })),
  action('pressure', 'Pressure calibration', 'pressure', (s, f) => ({
    get active() {
      return s.windows.isOpen('pressure');
    },
    onPress: f.command(() => s.windows.toggle('pressure'))
  })),
  tool('eraser', 'Eraser', 'erase'),
  tool('lasso', 'Lasso', 'lasso'),
  tool('fill', 'Fill', 'fill'),
  action('transform', 'Transform', 'move', (s, f) => ({
    get active() {
      return s.transform.active();
    },
    onPress: f.command(s.transform.toggle)
  })),
  action('layers', 'Layers', 'layers', () => ({}), {
    needs: (s, f) => ({
      get state() {
        return s.layers.state();
      },
      get ready() {
        return s.layers.ready();
      },
      onAction: f.command(s.layers.action),
      onLinearBlending: f.command(s.layers.blending)
    }),
    View: (props) => (
      <div class={styles.studioCard}>
        <LayersPanel {...props} />
      </div>
    )
  }),
  action('undo', 'Undo', 'undo', (s, f) => ({
    get disabled() {
      return !s.history.canUndo();
    },
    onPress: f.command(s.history.undo)
  })),
  action('redo', 'Redo', 'redo', (s, f) => ({
    get disabled() {
      return !s.history.canRedo();
    },
    onPress: f.command(s.history.redo)
  })),
  tool('local-undo', 'Local undo', 'localUndo'),
  action('mixing', 'Mixing', 'picker', (s, f) => ({
    get active() {
      return s.windows.isOpen('palette');
    },
    onPress: f.command(() => s.windows.toggle('palette'))
  }))
];

/** Controlled action look. Its callback owns command policy; the view only sizes and labels the button. */
function ActionPart(props: {
  label: string;
  icon: SketchIconName;
  span: Span;
  active?: boolean;
  disabled?: boolean;
  onPress: (anchor: Element) => void;
  status?: string;
}) {
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
      <Show when={props.span.columns >= 2}>
        <span class={styles.name}>{props.status ? `${props.label}: ${props.status}` : props.label}</span>
      </Show>
    </button>
  );
}

function action<N extends object, P extends object = N>(
  id: string,
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
    section: 'Tools',
    label,
    icon,
    popup,
    needs: (services, frame) =>
      merge(
        {
          label,
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
  return action(id, label, icon, (services, frame) => ({
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
        status={symmetryModes.find((mode) => mode.id === props.mode)?.label}
        onPress={props.onToggle}
      />
      <Show when={props.showModes}>
        <select
          aria-label="Paint symmetry mode"
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
