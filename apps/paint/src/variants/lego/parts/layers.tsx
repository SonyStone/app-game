import { createMemo, merge, onSettled, Show } from 'solid-js';
import { blendModeLabel, BlendModePicker } from '../../../features/layers/BlendModePicker';
import { layerCommand, LayerList, LayerName, type LayerCommand } from '../../../features/layers/LayerControls';
import { SketchIcon } from '../../../shared/ui/SketchIcon';
import styles from '../LayerParts.module.css';
import { LayerOpenerPart } from '../layersPrototype/LayerOpenerPart';
import { LayersStripPart } from '../layersPrototype/LayersStripPart';
import type { LegoServices } from '../LegoServices';
import { anyRoom, lookFits, type LookSpec } from '../looks';
import { fits, fitsLines, type TextStyle } from '../textFit';
import { definePart, type PartBinding } from './definition';

/**
 * The layer list's looks: a picture of a stack of layers that opens the list in a popup, rows wrapped under their
 * name, and wide rows from where a row has room for its eye, its thumbnail, a name and its grip side by side. The
 * picture is the look of a part too narrow for a row's thumbnail and eye together. Declared before the definitions,
 * which read it as they are made.
 */
const listLooks: readonly LookSpec[] = [
  { id: 'icon', label: 'Picture', min: anyRoom },
  { id: 'narrow', label: 'Narrow', min: anyRoom },
  { id: 'wide', label: 'Wide', min: { width: 136, height: 0 } }
];

/** The layers prototype strip's adaptive looks: compact thumbnail tiles (< 160 px) and indented wide tree (>= 160 px). */
const stripLooks: readonly LookSpec[] = [
  { id: 'strip', label: 'Strip', min: anyRoom },
  { id: 'wide', label: 'Wide', min: { width: 160, height: 0 } }
];
/** The width in CSS pixels from which the list shows its rows by itself: a row's eye beside a whole thumbnail. */
const listRowsWidth = 52;

/** Ordinary LEGO views of shared layer state. Only the mounted list acquires thumbnails, outside preview. */
export const layerParts = [
  definePart({
    kind: 'layers:strip',
    family: 'action',
    group: 'layer-list',
    section: 'Layers',
    label: 'Layers strip',
    icon: 'layers',
    defaultSpan: { columns: 2, rows: 8 },
    stretch: 'rows',
    looks: { looks: stripLooks, auto: (room) => (lookFits(stripLooks[1]!, room) ? 'wide' : 'strip') },
    needs: (s, f) => ({
      service: s.layersPrototype,
      get wide() {
        return f.look === 'wide';
      },
      get interactive() {
        return f.mode === 'live';
      }
    }),
    View: LayersStripPart
  }),
  definePart({
    kind: 'layers:opener',
    family: 'action',
    group: 'layer-list',
    section: 'Layers',
    label: 'Layers button',
    icon: 'layers',
    defaultSpan: { columns: 2, rows: 2 },
    owned: {
      parts: [{ id: 'strip', kind: 'layers:strip', cell: { column: 0, row: 0 }, span: { columns: 2, rows: 8 } }]
    },
    needs: (s, f) => ({
      service: s.layersPrototype,
      get open() {
        return f.open;
      },
      onOpen: f.onOpen
    }),
    View: LayerOpenerPart
  }),
  definePart({
    kind: 'layers:list',
    family: 'action',
    group: 'layer-list',
    section: 'Layers',
    label: 'Layer list',
    icon: 'layers',
    defaultSpan: { columns: 4, rows: 5 },
    stretch: 'rows',
    looks: {
      looks: listLooks,
      auto: (room) => (lookFits(listLooks[2]!, room) ? 'wide' : room.width >= listRowsWidth ? 'narrow' : 'icon')
    },
    needs: (s, f) =>
      merge(listNeeds(s, f), {
        get look() {
          return f.look;
        },
        onOpen: (anchor: Element) => f.onPopup(anchor, { kind: 'part', partKind: f.kind })
      }),
    View: (props) => (
      <Show when={props.look === 'icon'} fallback={<LayerListView {...props} narrow={props.look === 'narrow'} />}>
        <button
          type="button"
          class={styles.action}
          aria-label="Layer list"
          onClick={(event) => props.onOpen(event.currentTarget)}
        >
          <SketchIcon name="layers" size={20} />
        </button>
      </Show>
    ),
    popup: {
      needs: listNeeds,
      View: (props) => (
        <div class={styles.popupList}>
          <LayerListView {...props} narrow={false} />
        </div>
      )
    }
  }),
  definePart({
    kind: 'layers:name',
    family: 'action',
    group: 'layer-props',
    section: 'Layers',
    label: 'Layer name',
    icon: 'rename',
    defaultSpan: { columns: 4, rows: 1 },
    needs: (s, f) =>
      merge(layerNeeds(s, f), {
        get pictured() {
          const layer = s.layers.state().layers.find((candidate) => candidate.id === s.layers.state().activeId);
          return !fits(layer?.name ?? '', nameStyle, f.width - nameChrome);
        }
      }),
    View: (props) => (
      <div class={styles.nameField} data-pictured={props.pictured ? '' : undefined}>
        <LayerName
          layer={props.state.layers.find((layer) => layer.id === props.state.activeId)!}
          class={styles.name}
          onAction={props.onAction}
        />
        <Show when={props.pictured}>
          <span class={styles.nameGlyph} aria-hidden="true">
            <SketchIcon name="rename" size={20} />
          </span>
        </Show>
      </div>
    )
  }),
  definePart({
    kind: 'layers:blend',
    family: 'action',
    group: 'layer-props',
    section: 'Layers',
    label: 'Blend mode',
    icon: 'gradient',
    defaultSpan: { columns: 3, rows: 1 },
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
    View: (props) => (
      <div class={styles.blendPart} data-compact={props.compact ? '' : undefined}>
        <BlendModePicker {...props} classes={styles} />
        <Show when={props.compact}>
          <BlendRings />
        </Show>
      </div>
    )
  }),
  ...(['add', 'duplicate', 'delete', 'merge-down', 'up', 'down', 'lock', 'clip'] as const).map(commandPart),
  definePart({
    kind: 'layers:smooth-color',
    family: 'action',
    group: 'layer-blending',
    section: 'Layers',
    label: 'Smooth color',
    icon: 'gradient',
    defaultSpan: { columns: 3, rows: 1 },
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
        title={props.active ? 'Smooth color: on' : 'Smooth color: off, colors mix as Classic'}
        onClick={props.onPress}
      >
        <span class={styles.mixRamp} data-linear={props.active ? '' : undefined} />
        <Show when={props.wide}>
          <span>Smooth color</span>
        </Show>
      </button>
    )
  })
];

/**
 * The rings of the blend preview's two circles (see `blendPreview`), drawn over a compact blend mode's preview so that
 * it reads as the blend of two layers rather than a blob of color.
 */
function BlendRings() {
  return (
    <svg class={styles.blendRings} viewBox="0 0 256 256" aria-hidden="true">
      <circle cx="96" cy="128" r="80" />
      <circle cx="160" cy="128" r="80" />
    </svg>
  );
}

/** How the layer name's field sets the name, and the pixels its padding takes beside it. */
const nameStyle: TextStyle = { size: 13 };
const nameChrome = 2 * 8;

/** The list's own state: whether it may acquire thumbnails (never in previews) and the thumbnails' source. */
function listNeeds(services: LegoServices, frame: PartBinding) {
  return merge(layerNeeds(services, frame), {
    get acquire() {
      return frame.mode !== 'preview';
    },
    want: services.layers.wantThumbnails,
    thumbnail: services.layers.thumbnail
  });
}

/** The layer rows, `narrow` wrapped under their names, acquiring thumbnails while `acquire` holds. */
function LayerListView(props: ReturnType<typeof listNeeds> & { narrow: boolean }) {
  return (
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
  );
}

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
