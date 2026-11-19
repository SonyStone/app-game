import { createMemo, merge, onSettled, Show } from 'solid-js';
import { blendModeLabel, BlendModePicker } from '../../../features/layers/BlendModePicker';
import { layerCommand, LayerList, LayerName, type LayerCommand } from '../../../features/layers/LayerControls';
import { SketchIcon } from '../../../shared/ui/SketchIcon';
import styles from '../LayerParts.module.css';
import type { LegoServices } from '../LegoServices';
import { anyRoom, lookFits, type LookSpec } from '../looks';
import { fits, fitsLines, type TextStyle } from '../textFit';
import { definePart, type PartBinding } from './definition';

/**
 * The layer list's looks: rows wrapped under their name, and wide rows from where a row has room for its eye, its
 * thumbnail, a name and its grip side by side. Declared before the definitions, which read it as they are made.
 */
const listLooks: readonly LookSpec[] = [
  { id: 'narrow', label: 'Narrow', min: anyRoom },
  { id: 'wide', label: 'Wide', min: { width: 136, height: 0 } }
];

/** Ordinary LEGO views of shared layer state. Only the mounted list acquires thumbnails, outside preview. */
export const layerParts = [
  definePart({
    kind: 'layers:list',
    family: 'action',
    group: 'layer-list',
    section: 'Layers',
    label: 'Layer list',
    icon: 'book',
    looks: { looks: listLooks, auto: (room) => (lookFits(listLooks[1]!, room) ? 'wide' : 'narrow') },
    needs: (s, f) =>
      merge(layerNeeds(s, f), {
        get narrow() {
          return f.look === 'narrow';
        },
        get acquire() {
          return f.mode !== 'preview';
        },
        want: s.layers.wantThumbnails,
        thumbnail: s.layers.thumbnail
      }),
    View: (props) => (
      <div class={styles.list} data-narrow={props.narrow ? '' : undefined}>
        <Show when={props.acquire}>
          <WantThumbnails want={props.want} />
        </Show>
        <LayerList
          state={props.state}
          ready={props.ready}
          onAction={props.onAction}
          classes={styles}
          narrow={props.narrow}
          thumbnail={props.acquire ? props.thumbnail : undefined}
        />
      </div>
    )
  }),
  definePart({
    kind: 'layers:name',
    family: 'action',
    group: 'layer-props',
    section: 'Layers',
    label: 'Layer name',
    icon: 'paper',
    needs: layerNeeds,
    View: (props) => (
      <LayerName
        layer={props.state.layers.find((layer) => layer.id === props.state.activeId)!}
        class={styles.name}
        onAction={props.onAction}
      />
    )
  }),
  definePart({
    kind: 'layers:blend',
    family: 'action',
    group: 'layer-props',
    section: 'Layers',
    label: 'Blend mode',
    icon: 'gradient',
    needs: (s, f) => {
      const mode = createMemo(
        () => s.layers.state().layers.find((layer) => layer.id === s.layers.state().activeId)!.blend
      );
      const linear = createMemo(() => s.layers.state().linearBlending);
      return {
        get mode() {
          return mode();
        },
        get linear() {
          return linear();
        },
        get compact() {
          return !fits(blendModeLabel(mode()), blendStyle, f.width - blendChrome);
        },
        onChange: f.command((blend: Parameters<typeof BlendModePicker>[0]['mode']) =>
          s.layers.action({
            type: 'update',
            id: s.layers.state().activeId,
            patch: { blend }
          })
        )
      };
    },
    View: (props) => <BlendModePicker {...props} classes={styles} />
  }),
  ...(['add', 'duplicate', 'delete', 'merge-down', 'up', 'down', 'lock', 'clip'] as const).map(commandPart),
  definePart({
    kind: 'layers:smooth-color',
    family: 'action',
    group: 'layer-blending',
    section: 'Layers',
    label: 'Smooth color',
    icon: 'gradient',
    needs: (s, f) => ({
      get active() {
        return s.layers.state().linearBlending;
      },
      get wide() {
        return labelFits('Smooth color', f);
      },
      onPress: f.command(() => s.layers.blending(!s.layers.state().linearBlending))
    }),
    View: (props) => (
      <button
        class={styles.action}
        aria-label="Smooth color"
        aria-pressed={props.active ? 'true' : 'false'}
        onClick={props.onPress}
      >
        <SketchIcon name="gradient" size={20} />
        <Show when={props.wide}>
          <span>Smooth color</span>
        </Show>
      </button>
    )
  })
];

/**
 * Whether a layer button's `label` fits beside its icon (see `.action` in `LayerParts.module.css`): on as many lines
 * as the part's height holds, breaking between words.
 */
function labelFits(label: string, frame: Pick<PartBinding, 'width' | 'height'>) {
  const lines = Math.floor((frame.height - 2 * layerButtonPadding) / (layerLabelStyle.size * layerLabelLine));
  return fitsLines(label, layerLabelStyle, frame.width - layerButtonChrome, lines);
}

const layerLabelStyle: TextStyle = { size: 11 };
const layerLabelLine = 1.1;
const layerButtonPadding = 4;
/** The pixels a layer button's padding, its 20 px icon and the gap take beside its label. */
const layerButtonChrome = 2 * layerButtonPadding + 20 + 6;

/** How the blend mode button sets its name, and the pixels its padding, the 24 px preview and the gap take. */
const blendStyle: TextStyle = { size: 13 };
const blendChrome = 2 * 4 + 24 + 6;

/** Add, duplicate and delete manage the layers; the others order and combine the active layer. */
function layerCommandGroup(command: LayerCommand) {
  return command === 'add' || command === 'duplicate' || command === 'delete' ? 'layer-manage' : 'layer-order';
}

function commandPart(command: LayerCommand) {
  const labels = {
    add: 'Add layer',
    duplicate: 'Duplicate layer',
    delete: 'Delete layer',
    'merge-down': 'Merge down',
    up: 'Move layer up',
    down: 'Move layer down',
    lock: 'Lock transparent pixels',
    clip: 'Clip to layer below'
  };
  return definePart({
    kind: `layer:${command}`,
    family: 'action',
    group: layerCommandGroup(command),
    section: 'Layers',
    label: labels[command],
    needs: (s, f) => ({
      get control() {
        return layerCommand(command, s.layers.state(), s.layers.ready());
      },
      get wide() {
        return labelFits(layerCommand(command, s.layers.state(), s.layers.ready()).label, f);
      },
      onPress: f.command(() => s.layers.action(layerCommand(command, s.layers.state(), s.layers.ready()).action))
    }),
    View: (props) => (
      <button
        class={styles.action}
        disabled={props.control.disabled}
        aria-label={props.control.label}
        aria-pressed={'pressed' in props.control ? (props.control.pressed ? 'true' : 'false') : undefined}
        onClick={props.onPress}
      >
        <SketchIcon name={props.control.icon} size={20} />
        <Show when={props.wide}>
          <span>{props.control.label}</span>
        </Show>
      </button>
    )
  });
}

function layerNeeds(services: LegoServices, frame: PartBinding) {
  return {
    get state() {
      return services.layers.state();
    },
    get ready() {
      return services.layers.ready();
    },
    onAction: frame.command(services.layers.action)
  };
}

/** Demand lives under the mounted list owner, releasing on preview transition or disposal. */
function WantThumbnails(props: { want: LegoServices['layers']['wantThumbnails'] }) {
  onSettled(() => props.want(26));
  return undefined;
}
