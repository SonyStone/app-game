import { Show } from 'solid-js';
import { SketchIcon } from '../../../shared/ui/SketchIcon';
import type { Span } from '../board';
import { useGrid } from '../grid';
import { fitText, type TextStyle } from '../textFit';
import styles from './LayersPrototype.module.css';
import { blendModeInfo, type MockLayersService } from './mockLayers';

/**
 * Layers swatch button (`layers:opener`) owning a customizable LEGO panel (initialized with a `layers:strip`):
 * displays the active layer's thumbnail (or B&W mask thumbnail with red border when targeting a mask), total layer
 * count, and active mode/opacity badge. Tapping opens its owned LEGO folder beside it.
 */
export function LayerOpenerPart(props: {
  service: MockLayersService;
  open: boolean;
  onOpen: (anchor: Element) => void;
}) {
  const active = () => props.service.activeLayer();
  const isMask = () => props.service.target() === 'mask' && !!active()?.mask;
  const thumb = () => (isMask() ? active()?.mask?.thumb : active()?.thumb);
  const badge = () => {
    const node = active();
    if (!node) {
      return undefined;
    }

    if (isMask()) {
      return 'MASK';
    }

    const mode = blendModeInfo(node.blend);
    const nonDefaultMode = node.type === 'group' ? node.blend !== 'pass-through' : node.blend !== 'normal';
    if (nonDefaultMode && node.opacity < 100) {
      return `${mode.short} ${node.opacity}%`;
    }

    if (nonDefaultMode) {
      return mode.short;
    }

    return node.opacity < 100 ? `${node.opacity}%` : undefined;
  };

  return (
    <button
      type="button"
      class={styles.openerBtn}
      data-mask={isMask() ? '' : undefined}
      aria-label={`Layers (${props.service.totalCount()})`}
      aria-expanded={props.open ? 'true' : 'false'}
      onClick={(event) => props.onOpen(event.currentTarget)}
    >
      <div class={styles.openerThumb}>
        <Show when={thumb()}>{(src) => <img src={src()} alt="" />}</Show>
      </div>
      <span class={styles.openerCount}>{props.service.totalCount()}</span>
      <Show when={badge()}>
        {(text) => (
          <span class={styles.openerBadge} data-mask={isMask() ? '' : undefined}>
            {text()}
          </span>
        )}
      </Show>
    </button>
  );
}

/**
 * Universal LEGO folder/drawer button (`action:folder`) owning an initially empty panel where any LEGO parts (layers,
 * color pickers, brushes, sliders) can be dropped in Edit Mode.
 */
export function FolderButtonPart(props: {
  span: Span;
  open: boolean;
  onOpen: (anchor: Element) => void;
}) {
  const grid = useGrid();
  const caption = () => fitText(grid.length(props.span.columns) - drawerChrome, drawerLabelStyle, 'Drawer');

  return (
    <button
      type="button"
      class={styles.drawerBtn}
      data-open={props.open ? '' : undefined}
      aria-label="Drawer button"
      aria-expanded={props.open ? 'true' : 'false'}
      onClick={(event) => props.onOpen(event.currentTarget)}
    >
      <SketchIcon name="folder" size={20} />
      <Show when={caption()}>{(label) => <span>{label()}</span>}</Show>
    </button>
  );
}

const drawerLabelStyle: TextStyle = { size: 11, weight: 600 };
const drawerChrome = 2 * 6 + 20 + 6;
