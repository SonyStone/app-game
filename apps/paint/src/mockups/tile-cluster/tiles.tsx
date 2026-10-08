import { stabilizerLabel } from '@app-game/paint-core/stabilizerStroke';
import { For, Show } from 'solid-js';
import { hexToHsv, hsvToHex, parseHex } from '../../features/color/hsv';
import { HueTriangle } from '../../features/hue-triangle';
import { SketchIcon, type SketchIconName } from '../../shared/ui/SketchIcon';
import { ChoiceButton } from './ChoiceButton';
import styles from './mockup.module.css';
import {
  presets,
  stabilizerRows,
  tools,
  type Field,
  type Section,
  type SettingValue,
  type ToolId
} from './toolSettings';
import { ValueButton } from './ValueButton';

/**
 * The tools tile: a 4×3 grid of square buttons that never moves while the cluster is open, the tools followed by
 * Fit and Mirror for the view.
 */
export function ToolsTile(props: {
  class: string;
  tool: ToolId;
  flipped: boolean;
  onTool: (tool: ToolId) => void;
  onFit: () => void;
  onFlip: () => void;
}) {
  return (
    <div class={[styles.tile, styles.toolGrid, props.class]}>
      <For each={tools}>
        {(tool) => (
          <SquareButton
            icon={tool.icon}
            label={tool.label}
            size={22}
            on={props.tool === tool.id}
            onClick={() => props.onTool(tool.id)}
          />
        )}
      </For>
      <SquareButton icon="fullscreen" label="Fit the drawing" size={22} onClick={props.onFit} />
      <SquareButton icon="mirror" label="Mirror the view" size={22} on={props.flipped} onClick={props.onFlip} />
    </div>
  );
}

/**
 * The color tile: the hue triangle beside the current and previous colors, the hex code and HSV drag buttons, with
 * recent colors below. `onChange` follows drags; `onCommit` ends an edit, which updates the previous and recent
 * colors; `onChoose` sets and commits a color at once.
 */
export function ColorTile(props: {
  class: string;
  color: string;
  previous: string;
  recent: readonly string[];
  onChange: (color: string) => void;
  onCommit: () => void;
  onChoose: (color: string) => void;
}) {
  const hsv = () => hexToHsv(props.color);
  const setHsv = (part: Partial<ReturnType<typeof hexToHsv>>) => props.onChange(hsvToHex({ ...hsv(), ...part }));

  return (
    <div class={[styles.tile, styles.colorTile, props.class]}>
      <div class={styles.triangleBox}>
        <HueTriangle color={props.color} onChange={props.onChange} onSettle={props.onCommit} />
      </div>
      <div class={styles.colorSide}>
        <span class={styles.swatches}>
          <span class={styles.swatch} style={{ background: props.color }} title="Current color" />
          <button
            class={styles.swatch}
            style={{ background: props.previous }}
            title="Previous color: tap to swap"
            onClick={() => props.onChoose(props.previous)}
          />
        </span>
        <input
          class={styles.text}
          aria-label="Hex color"
          value={props.color.replace('#', '').toUpperCase()}
          onChange={(event) => {
            const hex = parseHex(event.currentTarget.value);
            if (hex) {
              props.onChoose(hex);
            } else {
              event.currentTarget.value = props.color.replace('#', '').toUpperCase();
            }
          }}
        />
        <ValueButton
          layout="inline"
          label="H"
          value={Math.round(hsv().h)}
          min={0}
          max={360}
          unit="°"
          onPreview={(h) => setHsv({ h })}
          onPick={(h) => {
            setHsv({ h });
            props.onCommit();
          }}
        />
        <ValueButton
          layout="inline"
          label="S"
          value={Math.round(hsv().s * 100)}
          min={0}
          max={100}
          unit="%"
          onPreview={(s) => setHsv({ s: s / 100 })}
          onPick={(s) => {
            setHsv({ s: s / 100 });
            props.onCommit();
          }}
        />
        <ValueButton
          layout="inline"
          label="V"
          value={Math.round(hsv().v * 100)}
          min={0}
          max={100}
          unit="%"
          onPreview={(v) => setHsv({ v: v / 100 })}
          onPick={(v) => {
            setHsv({ v: v / 100 });
            props.onCommit();
          }}
        />
      </div>
      <div class={styles.recent}>
        <For each={props.recent}>
          {(color) => (
            <button
              class={styles.recentSwatch}
              style={{ background: color }}
              title={color}
              onClick={() => props.onChoose(color)}
            />
          )}
        </For>
      </div>
    </div>
  );
}

/** Brush presets as cards, as the ABR viewer shows them: the name above a stroke across the card's width. */
export function PresetsTile(props: { class: string; preset: string; color: string; onPreset: (id: string) => void }) {
  return (
    <div class={[styles.tile, styles.presetGrid, props.class]}>
      <For each={presets}>
        {(preset) => (
          <button
            class={[styles.presetCard, { [styles.selected!]: props.preset === preset.id }]}
            aria-pressed={props.preset === preset.id ? 'true' : 'false'}
            onClick={() => props.onPreset(preset.id)}
          >
            <span class={styles.presetName}>{preset.name}</span>
            <StrokePreview
              size={preset.settings.size}
              hardness={preset.settings.hardness}
              opacity={preset.settings.opacity}
              color="#e4e4e4"
            />
          </button>
        )}
      </For>
    </div>
  );
}

/** A wavy stroke across the available width, thicker for larger sizes and softened by low hardness. */
function StrokePreview(props: { size: number; hardness: number; opacity: number; color: string }) {
  const thickness = () => Math.min(16, 1 + Math.log2(props.size) * 2);
  return (
    <svg class={styles.strokePreview} viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
      <path
        d="M6 19C22 4 38 4 52 13S80 25 94 9"
        fill="none"
        stroke={props.color}
        stroke-width={thickness()}
        stroke-linecap="round"
        opacity={0.3 + (props.opacity / 100) * 0.7}
        style={{ filter: `blur(${((100 - props.hardness) / 100) * thickness() * 0.4}px)` }}
      />
    </svg>
  );
}

/** Square buttons for the selection: select, cut, copy, paste, fill and the rest; the mockup only shows them. */
export function SelectionTile(props: { class: string }) {
  return (
    <div class={[styles.tile, styles.actionGrid, props.class]}>
      <For each={selectionActions}>
        {(action) => <SquareButton icon={action.icon} label={action.label} onClick={() => {}} />}
      </For>
    </div>
  );
}

const selectionActions: readonly { icon: SketchIconName; label: string }[] = [
  { icon: 'pixels', label: 'Select all' },
  { icon: 'close', label: 'Deselect' },
  { icon: 'reset', label: 'Invert selection' },
  { icon: 'feather', label: 'Feather' },
  { icon: 'move', label: 'Transform selection' },
  { icon: 'cut', label: 'Cut' },
  { icon: 'copy', label: 'Copy' },
  { icon: 'paste', label: 'Paste' },
  { icon: 'fill', label: 'Fill selection' },
  { icon: 'trash', label: 'Clear selection' }
];

/** One layer of the mockup's layer list; thumbnails are CSS backgrounds. */
export type MockLayer = {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  blend: string;
  opacity: number;
  thumb: string;
};

/** The layers tile: the active layer's blend mode and opacity, the list, and square list actions. */
export function LayersTile(props: {
  class: string;
  layers: readonly MockLayer[];
  active: string;
  onSelect: (id: string) => void;
  onUpdate: (id: string, change: Partial<MockLayer>) => void;
  onAction: (action: 'add' | 'duplicate' | 'delete' | 'up' | 'down') => void;
}) {
  const active = () => props.layers.find((layer) => layer.id === props.active);

  return (
    <div class={[styles.tile, styles.layersTile, props.class]}>
      <Show when={active()}>
        {(layer) => (
          <div class={styles.layerHeader}>
            <ChoiceButton
              label="Blend"
              value={layer().blend}
              options={blendModes}
              onPick={(blend) => props.onUpdate(layer().id, { blend })}
            />
            <ValueButton
              label="Opacity"
              value={layer().opacity}
              min={0}
              max={100}
              unit="%"
              onPreview={(opacity) => props.onUpdate(layer().id, { opacity })}
              onPick={(opacity) => props.onUpdate(layer().id, { opacity })}
            />
          </div>
        )}
      </Show>
      <div class={styles.layerList} role="listbox" aria-label="Layers">
        <For each={props.layers} keyed={(layer) => layer.id}>
          {(layer) => (
            <div
              class={[
                styles.layerRow,
                { [styles.selected!]: layer().id === props.active, [styles.dim!]: !layer().visible }
              ]}
              role="option"
              aria-selected={layer().id === props.active ? 'true' : 'false'}
              onClick={() => props.onSelect(layer().id)}
            >
              <IconToggle
                icon={layer().visible ? 'eye' : 'hidden'}
                label={layer().visible ? 'Hide layer' : 'Show layer'}
                on={layer().visible}
                onToggle={() => props.onUpdate(layer().id, { visible: !layer().visible })}
              />
              <span class={styles.thumb} style={{ background: layer().thumb }} />
              <span class={styles.layerName}>{layer().name}</span>
              <Show when={layer().blend !== 'Normal' || layer().opacity !== 100}>
                <span class={styles.layerMeta}>
                  {layer().blend !== 'Normal' ? layer().blend.slice(0, 3) : ''}{' '}
                  {layer().opacity !== 100 ? `${layer().opacity}%` : ''}
                </span>
              </Show>
              <IconToggle
                icon={layer().locked ? 'lock' : 'unlock'}
                label={layer().locked ? 'Unlock layer' : 'Lock layer'}
                on={layer().locked}
                onToggle={() => props.onUpdate(layer().id, { locked: !layer().locked })}
              />
            </div>
          )}
        </For>
      </div>
      <div class={styles.layerActions}>
        <SquareButton icon="plus" label="New layer" onClick={() => props.onAction('add')} />
        <SquareButton icon="copy" label="Duplicate" onClick={() => props.onAction('duplicate')} />
        <SquareButton icon="up" label="Move up" onClick={() => props.onAction('up')} />
        <SquareButton icon="down" label="Move down" onClick={() => props.onAction('down')} />
        <SquareButton icon="trash" label="Delete" onClick={() => props.onAction('delete')} />
      </div>
    </div>
  );
}

const blendModes = ['Normal', 'Multiply', 'Screen', 'Overlay', 'Soft light', 'Color', 'Luminosity', 'Add'];

/** The tool's settings: groups of compact controls, four to a row, separated by lines. */
export function SettingsTile(props: {
  class: string;
  sections: readonly Section[];
  values: Record<string, SettingValue>;
  onChange: (key: string, value: SettingValue) => void;
  /** Shows a value pointed at in a value grid, without committing it. */
  onPreview: (key: string, value: number) => void;
}) {
  return (
    <div class={[styles.tile, styles.settingsTile, props.class]}>
      <For each={props.sections}>
        {(section) => (
          <div class={styles.fields}>
            <For each={section.fields}>
              {(field) => (
                <FieldControl
                  field={field}
                  values={props.values}
                  onChange={props.onChange}
                  onPreview={props.onPreview}
                />
              )}
            </For>
          </div>
        )}
      </For>
    </div>
  );
}

/** The control for one field: a value button, a choice button, a toggle or the stabilizer level. */
function FieldControl(props: {
  field: Field;
  values: Record<string, SettingValue>;
  onChange: (key: string, value: SettingValue) => void;
  onPreview: (key: string, value: number) => void;
}) {
  const value = () => props.values[props.field.key];

  return (
    <>
      {(() => {
        const field = props.field;
        if (field.kind === 'number') {
          return (
            <ValueButton
              label={field.label}
              value={value() as number}
              min={field.min}
              max={field.max}
              step={field.step ?? 1}
              unit={field.unit ?? ''}
              scale={field.scale}
              presets={field.presets}
              dots={field.sizes}
              onPreview={(next) => props.onPreview(field.key, next)}
              onPick={(next) => props.onChange(field.key, next)}
            />
          );
        }

        if (field.kind === 'choice') {
          return (
            <ChoiceButton
              label={field.label}
              value={value() as string}
              options={field.options}
              onPick={(option) => props.onChange(field.key, option)}
            />
          );
        }

        if (field.kind === 'stabilizer') {
          return (
            <Show when={props.values[field.mode] !== 'Off'}>
              <Show
                when={props.values[field.mode] === 'SAI'}
                fallback={
                  <ValueButton
                    label="Strength"
                    value={(props.values.strength as number | undefined) ?? 20}
                    min={0}
                    max={49}
                    onPreview={(next) => props.onPreview('strength', next)}
                    onPick={(next) => props.onChange('strength', next)}
                  />
                }
              >
                <ValueButton
                  label="Level"
                  value={value() as number}
                  min={0}
                  max={stabilizerRows.flat().at(-1)!}
                  presets={stabilizerRows.flat()}
                  format={stabilizerLabel}
                  onPreview={(next) => props.onPreview(field.key, next)}
                  onPick={(next) => props.onChange(field.key, next)}
                />
              </Show>
            </Show>
          );
        }

        return (
          <button
            class={[styles.toggle, { [styles.on!]: !!value(), [styles.wide!]: !field.icon }]}
            aria-pressed={value() ? 'true' : 'false'}
            title={field.icon ? `Pen pressure controls ${field.label.toLowerCase()}` : field.label}
            onClick={() => props.onChange(field.key, !value())}
          >
            <Show when={field.icon}>{(icon) => <SketchIcon name={icon()} size={14} />}</Show>
            {field.label}
          </button>
        );
      })()}
    </>
  );
}

/** A square icon button; `on` shows it pressed, like the current tool. */
function SquareButton(props: {
  icon: SketchIconName;
  label: string;
  size?: number;
  on?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      class={[styles.square, { [styles.on!]: !!props.on }]}
      aria-label={props.label}
      aria-pressed={props.on === undefined ? undefined : props.on ? 'true' : 'false'}
      title={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <SketchIcon name={props.icon} size={props.size ?? 16} />
    </button>
  );
}

/** A small square toggle that does not select the row around it. */
function IconToggle(props: { icon: SketchIconName; label: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      class={[styles.iconToggle, { [styles.on!]: props.on }]}
      aria-pressed={props.on ? 'true' : 'false'}
      title={props.label}
      onClick={(event) => {
        event.stopPropagation();
        props.onToggle();
      }}
    >
      <SketchIcon name={props.icon} size={14} />
    </button>
  );
}
