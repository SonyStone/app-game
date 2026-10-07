import { Dynamic } from '@solidjs/web';
import { createMemo, createSignal, For, Show } from 'solid-js';

import { svgCapabilities } from '../../editor/capabilities';
import { colorToHex } from '../../editor/colors';
import {
  commandSelectionActions,
  deleteCommands,
  insertCommandAfter,
  moveSubpaths,
  nextCommandSelection,
  reverseSubpaths,
  setSubpathOrigins,
  type CommandSelection,
  type CommandsEdit
} from '../../editor/path-selection';
import type { HoverTarget } from '../../editor/contours';
import { ColorPopup } from '../color-picker/ColorPopup';
import { useColorSources } from '../color-picker/color-sources';
import { idValidity } from '../../editor/id-validity';
import { evaluateNumberExpression } from '../../editor/number-expression';
import type { SvgNodeActions } from '../documents/createSvgNodeActions';
import { parseTransformList } from '../../editor/geometry';
import { decorativeIconProps, type SvgIcon } from '../../editor/svg-icon';
import {
  clampNumericAttribute,
  orderedAttributes
} from '../../editor/tree-utils';
import {
  addPoint,
  commandParameters,
  convertCommand,
  createCommand,
  deletePoint,
  formatPathData,
  formatPathNumber,
  formatPoints,
  parsePathData,
  parsePoints,
  pathCommandLetters,
  toggleRelative,
  updateCommandValue,
  updatePoint,
  type PathCommand
} from '../../path-data';
import { attributeNumberRange } from '../../svg-db';
import { getAttribute, svgSize, type SvgAttribute, type SvgElementNode } from '../../svg-model';
import DeleteIcon from '../ui/icons/Delete.svg';
import InsertAfterIcon from '../ui/icons/InsertAfter.svg';
import PlusIcon from '../ui/icons/Plus.svg';
import ArrowIcon from './icons/Arrow.svg';
import InsertBeforeIcon from './icons/InsertBefore.svg';
import MatrixIcon from './icons/Matrix.svg';
import RotateIcon from './icons/Rotate.svg';
import ScaleIcon from './icons/Scale.svg';
import SkewXIcon from './icons/SkewX.svg';
import SkewYIcon from './icons/SkewY.svg';
import SmallMoreIcon from './icons/SmallMore.svg';
import TranslateIcon from './icons/Translate.svg';
import { useI18n } from '../../i18n/I18nProvider';

const rootEditorAttributes = ['width', 'height', 'viewBox', 'xmlns'] as const;
const transformTypes = ['matrix', 'translate', 'rotate', 'scale', 'skewX', 'skewY'] as const;

type TransformType = (typeof transformTypes)[number];
type TransformItem = {
  readonly type: TransformType;
  readonly body: string;
};

export function RootElementEditor(props: {
  readonly root: SvgElementNode;
  readonly updateElementAttribute: SvgNodeActions['updateElementAttribute'];
}) {
  const size = createMemo(() => svgSize(props.root));
  const rootValue = (name: 'width' | 'height') => getAttribute(props.root, name, true) || formatPathNumber(size()[name]);
  const viewBoxValues = createMemo(() =>
    listValues(getAttribute(props.root, 'viewBox', true), 4, size().viewBox.map(formatPathNumber))
  );
  const unknownAttrs = createMemo(() => props.root.attrs.filter((attr) => !isRootEditorAttribute(attr.name)));

  function updateViewBoxPart(index: number, value: string): void {
    const next = [...viewBoxValues()];
    next[index] = value;
    props.updateElementAttribute(props.root.id, 'viewBox', next.join(' '));
  }

  return (
    <div class="grid gap-0.75 px-1 pt-px pb-1.25" data-testid={`root-element-editor-${props.root.id}`}>
      <Show when={unknownAttrs().length > 0}>
        <div class="flex min-w-0 flex-wrap items-center gap-0.75 pb-0.5" data-testid="root-unknown-attributes">
          <For each={unknownAttrs()}>
            {(attr) => (
              <AttributeControl node={props.root} attr={attr} placeholder="" updateElementAttribute={props.updateElementAttribute} />
            )}
          </For>
        </div>
      </Show>
      <div class="flex flex-wrap items-end justify-center gap-x-7.5 gap-y-0.5" data-testid="root-attributes">
        <label
          class="m-0 grid min-w-0 justify-items-center gap-0 border-0 p-0 font-['GodSVG_Mono',ui-monospace,monospace] text-xs leading-none text-[var(--muted)]"
          data-testid="root-width-field"
        >
          <span class="h-3.75 px-0.5">width</span>
          <input
            class="block h-5.5 min-h-5.5 w-12 min-w-0 rounded-[5px] border border-[var(--soft-border)] bg-[#080b12] px-1.25 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]"
            name={`${props.root.id}-width`}
            aria-label="width"
            data-testid="root-width-input"
            value={rootValue('width')}
            onChange={(event) =>
              commitInput(event.currentTarget, clampNumericAttribute('width', event.currentTarget.value), (value) =>
                props.updateElementAttribute(props.root.id, 'width', value)
              )
            }
          />
        </label>
        <label
          class="m-0 grid min-w-0 justify-items-center gap-0 border-0 p-0 font-['GodSVG_Mono',ui-monospace,monospace] text-xs leading-none text-[var(--muted)]"
          data-testid="root-height-field"
        >
          <span class="h-3.75 px-0.5">height</span>
          <input
            class="block h-5.5 min-h-5.5 w-12 min-w-0 rounded-[5px] border border-[var(--soft-border)] bg-[#080b12] px-1.25 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]"
            name={`${props.root.id}-height`}
            aria-label="height"
            data-testid="root-height-input"
            value={rootValue('height')}
            onChange={(event) =>
              commitInput(event.currentTarget, clampNumericAttribute('height', event.currentTarget.value), (value) =>
                props.updateElementAttribute(props.root.id, 'height', value)
              )
            }
          />
        </label>
        <fieldset
          class="m-0 grid min-w-0 justify-items-center gap-0 border-0 p-0 font-['GodSVG_Mono',ui-monospace,monospace] text-xs leading-none text-[var(--muted)]"
          data-testid="root-viewbox-field"
        >
          <legend class="h-3.75 px-0.5">viewBox</legend>
          <div class="flex gap-0.75" data-testid="root-viewbox-inputs">
            <For each={viewBoxValues()} keyed={false}>
              {(value, index) => (
                <input
                  class="block h-5.5 min-h-5.5 w-12 min-w-0 rounded-[5px] border border-[var(--soft-border)] bg-[#080b12] px-1.25 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]"
                  name={`${props.root.id}-viewbox-${index}`}
                  aria-label={`viewBox ${index + 1}`}
                  data-testid={`root-viewbox-input-${index}`}
                  value={value()}
                  onChange={(event) =>
                    commitInput(
                      event.currentTarget,
                      clampNumericAttribute(index < 2 ? 'x' : 'width', event.currentTarget.value),
                      (part) => updateViewBoxPart(index, part)
                    )
                  }
                />
              )}
            </For>
          </div>
        </fieldset>
      </div>
    </div>
  );
}

export function AttributeGrid(props: {
  readonly node: SvgElementNode;
  /** The value the element renders for an attribute it does not set, shown as the field's placeholder. */
  readonly inheritedValue: (name: string) => string;
  readonly updateElementAttribute: SvgNodeActions['updateElementAttribute'];
  readonly commandSelection: CommandSelection | undefined;
  /** What the pointer is over in the viewport or inspector, highlighted in both. */
  readonly hovered: HoverTarget | undefined;
  readonly setHovered: (target: HoverTarget | undefined) => void;
  readonly setCommandSelection: (selection: CommandSelection | undefined) => void;
}) {
  const attrs = createMemo(() => orderedAttributes(props.node));
  const unknownAttrs = createMemo(() =>
    attrs().filter((attr) => !svgCapabilities.isAttributeRecognized(props.node.name, attr.name))
  );
  const compactAttrs = createMemo(() =>
    attrs().filter((attr) => svgCapabilities.isCompactAttribute(props.node.name, attr.name))
  );
  const pathDataAttr = createMemo(() =>
    attrs().find((attr) => svgCapabilities.getAttributeType(attr.name) === 'pathdata')
  );
  const pointsAttr = createMemo(() =>
    attrs().find((attr) => svgCapabilities.getAttributeType(attr.name) === 'list' && attr.name === 'points')
  );

  return (
    <div class="grid gap-0.5 p-1" data-testid={`attribute-grid-${props.node.id}`}>
      <Show when={unknownAttrs().length > 0}>
        <div
          class="flex min-w-0 flex-wrap items-center gap-0.75 pb-0.5"
          data-testid={`unknown-attributes-${props.node.id}`}
        >
          <For each={unknownAttrs()} keyed={(attr) => attr.name}>
            {(attr) => (
              <AttributeControl
                node={props.node}
                attr={attr()}
                placeholder={props.inheritedValue(attr().name)}
                updateElementAttribute={props.updateElementAttribute}
              />
            )}
          </For>
        </div>
      </Show>
      <div class="flex min-w-0 flex-wrap items-center gap-0.75" data-testid={`compact-attributes-${props.node.id}`}>
        {/* Keyed by name: attribute objects are rebuilt on every edit, and rebuilding the field would drop focus and
            pointer capture (slider drags). */}
        <For each={compactAttrs()} keyed={(attr) => attr.name}>
          {(attr) => (
            <AttributeControl
              node={props.node}
              attr={attr()}
              placeholder={props.inheritedValue(attr().name)}
              updateElementAttribute={props.updateElementAttribute}
            />
          )}
        </For>
      </div>
      <Show when={pointsAttr()}>
        {(attr) => (
          <PointsEditor
            nodeId={props.node.id}
            value={attr().value}
            update={(value) => props.updateElementAttribute(props.node.id, attr().name, value)}
          />
        )}
      </Show>
      <Show when={pathDataAttr()}>
        {(attr) => (
          <PathDataEditor
            node={props.node}
            value={attr().value}
            update={(value) => props.updateElementAttribute(props.node.id, attr().name, value)}
            commandSelection={props.commandSelection}
            hovered={props.hovered}
            setHovered={props.setHovered}
            setCommandSelection={props.setCommandSelection}
          />
        )}
      </Show>
    </div>
  );
}

/**
 * Field for one attribute, chosen by its type. An unset attribute shows `placeholder` (the inherited or default
 * value); a set value equal to it is shown in the warning color because it has no effect, as in GodSVG.
 */
function AttributeControl(props: {
  readonly node: SvgElementNode;
  readonly attr: SvgAttribute;
  readonly placeholder: string;
  readonly updateElementAttribute: SvgNodeActions['updateElementAttribute'];
}) {
  const capability = () => svgCapabilities.getAttribute(props.attr.name);
  const type = () => capability().type;
  const update = (value: string, mergeKey?: string) =>
    props.updateElementAttribute(props.node.id, props.attr.name, value, mergeKey);
  const redundant = () => props.attr.value !== '' && props.attr.value === props.placeholder;
  const hasSlider = () => type() === 'numeric' && numberRange(props.attr.name) === 'unit';

  return (
    <div
      class={[
        'h-5.5 min-w-0',
        {
          'w-20.5': type() === 'color',
          'w-20.25': type() === 'enum',
          'w-28': type() === 'href' || type() === 'id' || type() === 'unknown',
          'w-13.5': type() === 'list' || (type() === 'numeric' && !hasSlider()),
          'w-17': hasSlider(),
          'w-40.5': type() === 'transform-list'
        }
      ]}
      title={props.attr.name}
      data-testid={`attribute-control-${props.node.id}-${props.attr.name}`}
    >
      <Show when={type() === 'list' && props.attr.name !== 'points'}>
        <input
          class="block h-5.5 min-h-5.5 w-full min-w-0 rounded-[5px] border border-[var(--soft-border)] bg-[#080b12] px-1.25 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]"
          type="text"
          name={`${props.node.id}-${props.attr.name}`}
          aria-label={props.attr.name}
          data-testid={`attribute-input-${props.node.id}-${props.attr.name}`}
          value={props.attr.value}
          placeholder={props.placeholder}
          onChange={(event) => commitInput(event.currentTarget, event.currentTarget.value, update)}
        />
      </Show>
      <Show when={type() === 'numeric'}>
        <div class="flex h-5.5 min-w-0">
          <input
            class={[
              "block h-5.5 min-h-5.5 w-full min-w-0 rounded-[5px] border border-[var(--soft-border)] bg-[#080b12] px-1.25 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]",
              { 'rounded-r-none': hasSlider(), 'text-[var(--warning)]': redundant() }
            ]}
            type="text"
            name={`${props.node.id}-${props.attr.name}`}
            aria-label={props.attr.name}
            data-testid={`attribute-input-${props.node.id}-${props.attr.name}`}
            value={props.attr.value}
            placeholder={props.placeholder}
            onChange={(event) => commitNumberField(event.currentTarget, props.attr, update)}
          />
          <Show when={hasSlider()}>
            <UnitSlider
              nodeId={props.node.id}
              attrName={props.attr.name}
              value={Number.parseFloat(props.attr.value || props.placeholder) || 0}
              update={update}
            />
          </Show>
        </div>
      </Show>
      <Show when={type() === 'enum'}>
        <select
          class="block h-5.5 min-h-5.5 w-full min-w-0 rounded-[5px] border border-[var(--soft-border)] bg-[#080b12] px-1.25 pr-4.5 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]"
          name={`${props.node.id}-${props.attr.name}`}
          aria-label={props.attr.name}
          data-testid={`attribute-select-${props.node.id}-${props.attr.name}`}
          value={props.attr.value}
          onChange={(event) => update(event.currentTarget.value)}
        >
          <option value="">{props.placeholder} (default)</option>
          <For each={capability().enumValues}>{(value) => <option value={value}>{value}</option>}</For>
        </select>
      </Show>
      <Show when={type() === 'color'}>
        <ColorField nodeId={props.node.id} attr={props.attr} placeholder={props.placeholder} update={update} />
      </Show>
      <Show when={type() === 'transform-list'}>
        <TransformField nodeId={props.node.id} attrName={props.attr.name} value={props.attr.value} update={update} />
      </Show>
      <Show when={type() === 'id'}>
        <IdField nodeId={props.node.id} value={props.attr.value} update={update} />
      </Show>
      <Show when={type() === 'href' || type() === 'unknown'}>
        <input
          class="block h-5.5 min-h-5.5 w-full min-w-0 rounded-[5px] border border-[var(--soft-border)] bg-[#080b12] px-1.25 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]"
          name={`${props.node.id}-${props.attr.name}`}
          aria-label={props.attr.name}
          data-testid={`attribute-input-${props.node.id}-${props.attr.name}`}
          value={props.attr.value}
          placeholder={props.placeholder || props.attr.name}
          onChange={(event) => update(event.currentTarget.value)}
        />
      </Show>
    </div>
  );
}

/**
 * Commits a number field like GodSVG: an empty field removes the attribute, values with a unit or percentage are kept
 * (clamped to the attribute's range), and anything else is evaluated as an expression and clamped. Text that does
 * not evaluate puts the previous value back.
 */
function commitNumberField(input: HTMLInputElement, attr: SvgAttribute, update: (value: string) => void): void {
  const text = input.value.trim();

  if (text === '' || /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?\s*(?:%|[a-zA-Z]+)$/.test(text)) {
    commitInput(input, clampNumericAttribute(attr.name, text), update);
    return;
  }

  const value = evaluateNumberExpression(text);

  if (Number.isNaN(value)) {
    input.value = attr.value;
    return;
  }

  commitInput(input, clampNumericAttribute(attr.name, formatPathNumber(value)), update);
}

function numberRange(name: string): string | undefined {
  const ranges: Readonly<Record<string, string>> = attributeNumberRange;
  return ranges[name];
}

/**
 * GodSVG's slider for 0–1 attributes such as opacity: a gauge beside the field that fills with the value. Dragging
 * vertically sets the value in 0.01 steps (one undo step per drag); arrow keys step by 0.01, or 0.1 with Shift.
 */
function UnitSlider(props: {
  readonly nodeId: string;
  readonly attrName: string;
  readonly value: number;
  readonly update: (value: string, mergeKey?: string) => void;
}) {
  let dragSession = 0;
  const fill = () => `${Math.min(1, Math.max(0, props.value)) * 100}%`;
  const setValue = (value: number, mergeKey?: string) =>
    props.update(formatPathNumber(Math.round(Math.min(1, Math.max(0, value)) * 100) / 100), mergeKey);
  const valueAt = (element: HTMLElement, clientY: number) => {
    const rect = element.getBoundingClientRect();
    return 1 - (clientY - rect.top) / rect.height;
  };

  return (
    <div
      class="relative h-5.5 w-3 min-w-3 cursor-ns-resize touch-none overflow-hidden rounded-r-[5px] border border-l-0 border-[var(--soft-border)] bg-[#080b12] outline-none hover:border-[var(--accent)] focus-visible:border-[var(--accent)] in-[.theme-light]:bg-[#f8fbff]"
      role="slider"
      tabindex={0}
      aria-label={`${props.attrName} slider`}
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={props.value}
      data-testid={`attribute-slider-${props.nodeId}-${props.attrName}`}
      onPointerDown={(event) => {
        // The inspector card is draggable; without this the gesture would start a card drag and steal the pointer.
        event.preventDefault();
        dragSession += 1;
        event.currentTarget.setPointerCapture(event.pointerId);
        setValue(valueAt(event.currentTarget, event.clientY), `slider:${props.nodeId}:${props.attrName}:${dragSession}`);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          setValue(valueAt(event.currentTarget, event.clientY), `slider:${props.nodeId}:${props.attrName}:${dragSession}`);
        }
      }}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 0.1 : 0.01;

        if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
          event.preventDefault();
          setValue(props.value + step);
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
          event.preventDefault();
          setValue(props.value - step);
        }
      }}
    >
      <div class="pointer-events-none absolute inset-x-0 bottom-0 bg-[color-mix(in_srgb,var(--accent)_60%,transparent)]" style={{ height: fill() }} />
    </div>
  );
}

/**
 * The id field, colored by GodSVG's validity rules while typing: whitespace or a leading `#` is invalid (red) and is
 * not committed; characters outside XML name tokens are allowed but shown as a warning.
 */
function IdField(props: { readonly nodeId: string; readonly value: string; readonly update: (value: string) => void }) {
  const { t } = useI18n();
  const [draft, setDraft] = createSignal<string>();
  const validity = () => idValidity(draft() ?? props.value);

  return (
    <input
      class={[
        "block h-5.5 min-h-5.5 w-full min-w-0 rounded-[5px] border border-[var(--soft-border)] bg-[#080b12] px-1.25 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]",
        { 'text-[var(--danger)]': validity() === 'invalid', 'text-[var(--warning)]': validity() === 'warning' }
      ]}
      name={`${props.nodeId}-id`}
      aria-label="id"
      aria-invalid={validity() === 'invalid' ? 'true' : 'false'}
      data-testid={`attribute-input-${props.nodeId}-id`}
      value={props.value}
      placeholder={t('No ID')}
      onInput={(event) => setDraft(event.currentTarget.value)}
      onChange={(event) => {
        setDraft(undefined);

        if (idValidity(event.currentTarget.value) === 'invalid') {
          event.currentTarget.value = props.value;
          return;
        }

        commitInput(event.currentTarget, event.currentTarget.value, props.update);
      }}
    />
  );
}

/**
 * A color attribute: a text field plus a swatch that opens the color popup. A popup session (open to close) is one
 * undo step. Unset attributes show the inherited color; `url(#id)` swatches show the referenced gradient.
 */
function ColorField(props: {
  readonly nodeId: string;
  readonly attr: SvgAttribute;
  /** Inherited or default color, shown when the attribute is unset. */
  readonly placeholder: string;
  readonly update: (value: string, mergeKey?: string) => void;
}) {
  const sources = useColorSources();
  const [popupAnchor, setPopupAnchor] = createSignal<HTMLElement>();
  let popupSession = 0;
  let swatchButton: HTMLButtonElement | undefined;
  const color = () => svgCapabilities.getAttribute(props.attr.name).color;
  const shown = () => props.attr.value || props.placeholder;
  const gradient = () => {
    const id = /^url\(\s*#(.*?)\s*\)$/.exec(shown())?.[1];
    return id === undefined ? undefined : sources.gradients().find((item) => item.id === id);
  };
  // `none`, unknown references, and unknown text show the checkerboard.
  const swatchBackground = () =>
    gradient()?.preview ?? `linear-gradient(${colorToHex(shown()) ?? (shown() === 'currentColor' ? 'currentColor' : 'transparent')} 0 0)`;

  return (
    <div
      class="relative grid min-w-0 grid-cols-[minmax(0,1fr)_22px] gap-0 [&>input]:rounded-r-none"
      data-testid={`color-field-${props.nodeId}-${props.attr.name}`}
    >
      <input
        class="block h-5.5 min-h-5.5 min-w-0 rounded-[5px] border border-[var(--soft-border)] bg-[#080b12] px-1.25 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]"
        name={`${props.nodeId}-${props.attr.name}`}
        aria-label={props.attr.name}
        data-testid={`color-input-${props.nodeId}-${props.attr.name}`}
        value={props.attr.value}
        placeholder={props.placeholder}
        onChange={(event) => props.update(event.currentTarget.value)}
      />
      <button
        ref={(element) => (swatchButton = element)}
        type="button"
        class="relative grid h-5.5 w-5.5 min-w-5.5 cursor-pointer place-items-center overflow-hidden rounded-r-[5px] border border-l-0 border-[var(--soft-border)] bg-[var(--panel-2)] hover:border-[var(--accent)] focus-visible:border-[var(--accent)]"
        title={`${props.attr.name} color`}
        aria-label={`${props.attr.name} color picker`}
        aria-expanded={popupAnchor() ? 'true' : 'false'}
        data-testid={`color-picker-label-${props.nodeId}-${props.attr.name}`}
        onClick={() => setPopupAnchor(popupAnchor() ? undefined : swatchButton)}
      >
        <span
          class="relative h-4.5 w-3.5 rounded-xs border border-[color-mix(in_srgb,var(--soft-border)_70%,#fff)] [background:var(--swatch),linear-gradient(45deg,#8b93a7_25%,transparent_25%_75%,#8b93a7_75%)_0_0/8px_8px,linear-gradient(45deg,transparent_25%,#303747_25%_75%,transparent_75%)_4px_4px/8px_8px]"
          style={{ '--swatch': swatchBackground() }}
        >
          <Show when={shown() === 'none'}>
            <span class="absolute top-2 -left-0.75 w-5 rotate-[-42deg] border-t-2 border-white" />
          </Show>
        </span>
      </button>
      <Show when={popupAnchor()}>
        {(anchor) => (
          <ColorPopup
            value={props.attr.value}
            fallback={props.placeholder}
            allowNone={color().allowNone}
            allowCurrentColor={color().allowCurrentColor}
            allowUrl={color().allowUrl}
            anchor={anchor()}
            onChange={(value) => props.update(value, `color-popup:${props.nodeId}:${props.attr.name}:${popupSession}`)}
            onClose={() => {
              popupSession += 1;
              setPopupAnchor(undefined);
            }}
          />
        )}
      </Show>
    </div>
  );
}

function PathDataEditor(props: {
  readonly node: SvgElementNode;
  readonly value: string;
  readonly update: (value: string) => void;
  readonly commandSelection: CommandSelection | undefined;
  /** What the pointer is over in the viewport or inspector, highlighted in both. */
  readonly hovered: HoverTarget | undefined;
  readonly setHovered: (target: HoverTarget | undefined) => void;
  readonly setCommandSelection: (selection: CommandSelection | undefined) => void;
}) {
  const { t } = useI18n();
  const commands = createMemo(() => parsePathData(props.value));

  function updateCommands(next: readonly PathCommand[]): void {
    props.update(formatPathData(next));
  }

  return (
    <div class="grid w-full min-w-0 gap-0.5" data-testid={`path-data-editor-${props.node.id}`}>
      <input
        class="block h-5.5 min-h-5.5 w-full min-w-0 rounded-[5px] border border-[var(--soft-border)] bg-[#080b12] px-1.25 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]"
        name={`${props.node.id}-d`}
        aria-label="Path data"
        data-testid={`path-data-input-${props.node.id}`}
        value={props.value}
        placeholder={t('No path data')}
        onChange={(event) => props.update(event.currentTarget.value)}
      />
      <div class="grid gap-px" data-testid={`path-command-list-${props.node.id}`}>
        <For each={commands()} keyed={false}>
          {(command, index) => (
            <PathCommandRow
              nodeId={props.node.id}
              command={command()}
              index={index}
              commands={commands()}
              updateCommands={updateCommands}
              commandSelection={props.commandSelection}
              hovered={props.hovered}
              setHovered={props.setHovered}
              setCommandSelection={props.setCommandSelection}
            />
          )}
        </For>
        <button
          type="button"
          class="inline-grid h-5.5 min-w-5.5 cursor-pointer place-items-center rounded-[5px] border border-[var(--soft-border)] bg-[var(--panel-2)]"
          title="Add move command"
          data-testid={`path-command-add-${props.node.id}`}
          onClick={() => updateCommands([...commands(), createCommand('M')])}
        >
          <PlusIcon {...decorativeIconProps} />
        </button>
      </div>
    </div>
  );
}

function PathCommandRow(props: {
  readonly nodeId: string;
  readonly command: PathCommand;
  readonly index: number;
  readonly commands: readonly PathCommand[];
  readonly updateCommands: (next: readonly PathCommand[]) => void;
  readonly commandSelection: CommandSelection | undefined;
  /** What the pointer is over in the viewport or inspector, highlighted in both. */
  readonly hovered: HoverTarget | undefined;
  readonly setHovered: (target: HoverTarget | undefined) => void;
  readonly setCommandSelection: (selection: CommandSelection | undefined) => void;
}) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = createSignal(false);
  const isRelative = () => props.command.command === props.command.command.toLowerCase();
  const parameters = createMemo(() => commandParameters(props.command.command));
  const selected = () => {
    const current = props.commandSelection;
    return current?.nodeId === props.nodeId && current.indices.includes(props.index);
  };
  const hovered = () => props.hovered?.nodeId === props.nodeId && props.hovered.commandIndex === props.index;

  function updateCommands(next: readonly PathCommand[]): void {
    props.updateCommands(next);
    setMenuOpen(false);
  }

  /** Applies an edit of the selected commands and moves the selection with them. */
  function applyEdit(edit: CommandsEdit): void {
    updateCommands(edit.commands);
    props.setCommandSelection(
      edit.indices.length > 0 ? { nodeId: props.nodeId, indices: edit.indices, pivot: edit.indices[0] ?? 0 } : undefined
    );
  }

  /** The selected commands this row's menu acts on: the selection when it includes the row, else the row alone. */
  const menuIndices = () => (selected() ? (props.commandSelection?.indices ?? [props.index]) : [props.index]);
  const actions = createMemo(() => (menuOpen() ? commandSelectionActions(props.commands, menuIndices()) : undefined));

  /** Selects this command like GodSVG: plain replaces, Ctrl/Cmd toggles, Shift extends from the pivot. */
  function selectCurrent(event?: MouseEvent | PointerEvent): void {
    const modifiers = { ctrl: Boolean(event?.ctrlKey || event?.metaKey), shift: Boolean(event?.shiftKey) };

    if (!event && selected()) {
      return;
    }

    props.setCommandSelection(nextCommandSelection(props.commandSelection, props.nodeId, props.index, modifiers));
  }

  return (
    <div
      class={[
        'relative flex min-h-5.5 items-start gap-0.75 overflow-visible rounded-[3px] bg-transparent px-0.75 py-0.5',
        {
          'border-[var(--accent)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_68%,transparent)]': selected(),
          'bg-[color-mix(in_srgb,#aaaaaa_18%,transparent)]': hovered()
        }
      ]}
      data-testid={`path-command-row-${props.nodeId}-${props.index}`}
      data-hovered={hovered() ? 'true' : undefined}
      onPointerEnter={() => props.setHovered({ nodeId: props.nodeId, commandIndex: props.index })}
      onPointerLeave={() => props.setHovered({ nodeId: props.nodeId })}
      onPointerDown={(event) => {
        if (!(event.target as Element).closest('input, button')) {
          selectCurrent(event);
        }
      }}
      onFocusOut={(event) => {
        const nextFocus = event.relatedTarget;

        if (nextFocus instanceof Node && event.currentTarget.contains(nextFocus)) {
          return;
        }

        setMenuOpen(false);
      }}
    >
      <button
        type="button"
        class={[
          "static mt-0 grid h-4.5 min-h-4.5 w-4.5 min-w-4.5 flex-[0_0_auto] cursor-pointer place-items-center rounded border-2 p-0 font-['GodSVG_Mono',ui-monospace,monospace] text-xs leading-none text-[#fff8ff]",
          {
            'border-[#bd73e6] bg-[#a329cc] hover:border-[#d291f2] hover:bg-[#ad2bd9] focus-visible:border-[#d291f2] focus-visible:bg-[#ad2bd9]':
              isRelative(),
            'border-[#e6ae5c] bg-[#cc7a29] hover:border-[#f2cb91] hover:bg-[#d9822b] focus-visible:border-[#f2cb91] focus-visible:bg-[#d9822b]':
              !isRelative()
          }
        ]}
        title={pathCommandDescription(props.command.command, t)}
        data-testid={`path-command-toggle-${props.nodeId}-${props.index}`}
        onClick={(event) => {
          selectCurrent(event);
          props.updateCommands(toggleRelative(props.commands, props.index));
        }}
      >
        {props.command.command}
      </button>
      <div class="flex min-w-0 flex-[1_1_auto] flex-wrap items-center gap-0.75 overflow-visible">
        <For each={parameters()} keyed={false}>
          {(parameter) => {
            const value = () => formatPathNumber(props.command.values[parameter().index] ?? 0);
            const flag = () => parameter().name === 'large' || parameter().name === 'sweep';

            return (
              <input
                class={[
                  "h-4.5 min-h-4.5 min-w-0 flex-[0_0_auto] [appearance:textfield] rounded-[3px] border border-[var(--soft-border)] bg-[#080b12] px-0.75 text-left font-['GodSVG_Mono',ui-monospace,monospace] text-[10px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]",
                  {
                    'text-center': flag()
                  }
                ]}
                type="text"
                inputmode={flag() ? 'numeric' : 'decimal'}
                name={`${props.nodeId}-command-${props.index}-${parameter().name}`}
                aria-label={parameter().name}
                title={parameter().name}
                data-testid={`path-command-param-${props.nodeId}-${props.index}-${parameter().name}`}
                value={value()}
                style={{ width: pathParamInputWidth(value(), parameter().name) }}
                onFocus={() => selectCurrent()}
                onChange={(event) => {
                  const parsed = parsePathParamValue(event.currentTarget.value);
                  commitInput(event.currentTarget, formatPathNumber(parsed), () =>
                    updateCommands(updateCommandValue(props.commands, props.index, parameter().index, parsed))
                  );
                }}
              />
            );
          }}
        </For>
      </div>
      <button
        type="button"
        class="static grid h-5.5 min-w-5.5 flex-[0_0_auto] cursor-pointer place-items-center self-start rounded-[5px] border border-transparent bg-transparent p-0 hover:border-[var(--soft-border)] hover:bg-[var(--panel-2)] focus-visible:border-[var(--soft-border)] focus-visible:bg-[var(--panel-2)]"
        title="Path command actions"
        data-testid={`path-command-actions-${props.nodeId}-${props.index}`}
        onClick={() => setMenuOpen(!menuOpen())}
      >
        <SmallMoreIcon {...decorativeIconProps} />
      </button>
      <Show when={menuOpen()}>
        <div
          class="absolute top-[calc(100%+2px)] right-0.5 z-30 grid min-w-35.5 gap-0.75 rounded-[5px] border border-[var(--border)] bg-[var(--panel)] p-1 shadow-[0_10px_24px_rgb(0_0_0/34%)]"
          data-testid={`path-command-menu-${props.nodeId}-${props.index}`}
        >
          <button
            class="flex min-h-5.5 w-full cursor-pointer items-center justify-start gap-1.5 rounded-[5px] border border-[var(--soft-border)] bg-[var(--panel-2)] px-1.5 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] text-[var(--text)]"
            type="button"
            data-testid={`path-command-insert-after-${props.nodeId}-${props.index}`}
            onClick={() => applyEdit(insertCommandAfter(props.commands, props.index, props.command.command))}
          >
            <InsertAfterIcon {...decorativeIconProps} /> {t('Insert after')}
          </button>
          <div class="grid grid-cols-5 gap-0.75">
            <For each={pathCommandLetters}>
              {(letter) => (
                <button
                  class="grid h-5.5 w-full place-items-center justify-center rounded-[5px] border border-[var(--soft-border)] bg-[var(--panel-2)] p-0 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] text-[var(--text)]"
                  type="button"
                  title={pathCommandDescription(letter, t)}
                  data-testid={`path-command-convert-${props.nodeId}-${props.index}-${letter}`}
                  onClick={() =>
                    updateCommands(
                      convertCommand(props.commands, props.index, isRelative() ? letter.toLowerCase() : letter)
                    )
                  }
                >
                  {letter}
                </button>
              )}
            </For>
          </div>
          <button
            class="flex min-h-5.5 w-full cursor-pointer items-center justify-start gap-1.5 rounded-[5px] border border-[var(--soft-border)] bg-[var(--panel-2)] px-1.5 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] text-[var(--text)]"
            type="button"
            data-testid={`path-command-delete-${props.nodeId}-${props.index}`}
            onClick={() => applyEdit({ commands: deleteCommands(props.commands, menuIndices()), indices: [] })}
          >
            <DeleteIcon {...decorativeIconProps} /> {menuIndices().length > 1 ? `Delete ${menuIndices().length} commands` : t('Delete')}
          </button>
          <For
            each={[
              { key: 'move-up', label: 'Move subpaths up', show: actions()?.moveUp, run: () => moveSubpaths(props.commands, menuIndices(), -1) },
              { key: 'move-down', label: 'Move subpaths down', show: actions()?.moveDown, run: () => moveSubpaths(props.commands, menuIndices(), 1) },
              { key: 'reverse', label: 'Reverse order', show: actions()?.reverse, run: () => reverseSubpaths(props.commands, menuIndices()) },
              { key: 'set-origin', label: 'Set as initial', show: actions()?.setOrigin, run: () => setSubpathOrigins(props.commands, menuIndices()) }
            ].filter((action) => action.show)}
          >
            {(action) => (
              <button
                class="flex min-h-5.5 w-full cursor-pointer items-center justify-start gap-1.5 rounded-[5px] border border-[var(--soft-border)] bg-[var(--panel-2)] px-1.5 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] text-[var(--text)]"
                type="button"
                data-testid={`path-command-${action.key}-${props.nodeId}-${props.index}`}
                onClick={() => applyEdit(action.run())}
              >
                {t(action.label)}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function PointsEditor(props: {
  readonly nodeId: string;
  readonly value: string;
  readonly update: (value: string) => void;
}) {
  const points = createMemo(() => parsePoints(props.value));

  return (
    <div class="grid min-w-0 gap-0.75" data-testid={`points-editor-${props.nodeId}`}>
      <input
        class="block h-5.5 min-h-5.5 min-w-0 rounded-[5px] border border-[var(--soft-border)] bg-[#080b12] px-1.25 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]"
        name="points"
        aria-label="Points"
        data-testid={`points-input-${props.nodeId}`}
        value={props.value}
        onChange={(event) => props.update(event.currentTarget.value)}
      />
      <div class="grid gap-px" data-testid={`points-list-${props.nodeId}`}>
        <For each={points()} keyed={false}>
          {(point, index) => (
            <div
              class="grid grid-cols-[24px_1fr_1fr_24px] items-center gap-0.75"
              data-testid={`point-row-${props.nodeId}-${index}`}
            >
              <span data-testid={`point-index-${props.nodeId}-${index}`}>{index + 1}</span>
              <input
                class="block h-5.5 min-h-5.5 w-14.5 min-w-0 rounded-[5px] border border-[var(--soft-border)] bg-[#080b12] px-1.25 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]"
                type="number"
                name={`point-${index}-x`}
                aria-label="Point x"
                data-testid={`point-x-${props.nodeId}-${index}`}
                value={point()[0]}
                onChange={(event) => {
                  const x = Number.parseFloat(event.currentTarget.value) || 0;
                  commitInput(event.currentTarget, String(x), () =>
                    props.update(formatPoints(updatePoint(points(), index, 0, x)))
                  );
                }}
              />
              <input
                class="block h-5.5 min-h-5.5 w-14.5 min-w-0 rounded-[5px] border border-[var(--soft-border)] bg-[#080b12] px-1.25 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]"
                type="number"
                name={`point-${index}-y`}
                aria-label="Point y"
                data-testid={`point-y-${props.nodeId}-${index}`}
                value={point()[1]}
                onChange={(event) => {
                  const y = Number.parseFloat(event.currentTarget.value) || 0;
                  commitInput(event.currentTarget, String(y), () =>
                    props.update(formatPoints(updatePoint(points(), index, 1, y)))
                  );
                }}
              />
              <button
                class="inline-grid h-5.5 min-w-5.5 cursor-pointer place-items-center rounded-[5px] border border-[var(--soft-border)] bg-[var(--panel-2)]"
                type="button"
                data-testid={`point-delete-${props.nodeId}-${index}`}
                onClick={() => props.update(formatPoints(deletePoint(points(), index)))}
              >
                <DeleteIcon {...decorativeIconProps} />
              </button>
            </div>
          )}
        </For>
        <button
          type="button"
          class="inline-grid h-5.5 min-w-5.5 cursor-pointer place-items-center rounded-[5px] border border-[var(--soft-border)] bg-[var(--panel-2)]"
          data-testid={`point-add-${props.nodeId}`}
          onClick={() => props.update(formatPoints(addPoint(points())))}
        >
          <PlusIcon {...decorativeIconProps} />
        </button>
      </div>
    </div>
  );
}

function TransformField(props: {
  readonly nodeId: string;
  readonly attrName: string;
  readonly value: string;
  readonly update: (value: string) => void;
}) {
  const { t } = useI18n();
  const [popupOpen, setPopupOpen] = createSignal(false);
  const [activeTransformMenu, setActiveTransformMenu] = createSignal<number>();
  const [insertMenu, setInsertMenu] = createSignal<number>();
  const transformItems = createMemo(() => parseTransformItems(props.value));
  const finalMatrix = createMemo(() => parseTransformList(props.value));

  function updateTransforms(items: readonly TransformItem[]): void {
    props.update(items.map((item) => `${item.type}(${item.body})`).join(' '));
  }

  function insertTransform(index: number, type: TransformType): void {
    const items = [...transformItems()];
    items.splice(Math.max(0, Math.min(index, items.length)), 0, createTransformItem(type));
    updateTransforms(items);
    setInsertMenu(undefined);
    setActiveTransformMenu(undefined);
  }

  function deleteTransform(index: number): void {
    updateTransforms(transformItems().filter((_, itemIndex) => itemIndex !== index));
    setInsertMenu(undefined);
    setActiveTransformMenu(undefined);
  }

  function updateTransformBody(index: number, body: string): void {
    updateTransforms(transformItems().map((item, itemIndex) => (itemIndex === index ? { ...item, body } : item)));
  }

  return (
    <div
      class="relative grid min-w-0 grid-cols-[minmax(0,1fr)_22px] gap-0 [&>input]:rounded-r-none"
      data-testid={`transform-field-${props.nodeId}-${props.attrName}`}
    >
      <input
        class="block h-5.5 min-h-5.5 min-w-0 rounded-[5px] border border-[var(--soft-border)] bg-[#080b12] px-1.25 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]"
        name="transform"
        aria-label="Transform"
        data-testid={`transform-input-${props.nodeId}-${props.attrName}`}
        placeholder={t('No transforms')}
        value={props.value}
        onChange={(event) => props.update(event.currentTarget.value)}
      />
      <button
        type="button"
        class="grid h-5.5 w-5.5 min-w-5.5 cursor-pointer place-items-center rounded-r-[5px] border border-l-0 border-[var(--soft-border)] bg-[var(--panel-2)] hover:border-[var(--accent)] focus-visible:border-[var(--accent)]"
        data-testid={`transform-popup-button-${props.nodeId}-${props.attrName}`}
        onClick={() => setPopupOpen(!popupOpen())}
      >
        <ArrowIcon {...decorativeIconProps} />
      </button>
      <Show when={popupOpen()}>
        <div
          class="absolute top-6.25 left-0 z-40 grid w-max max-w-[calc(100vw-32px)] min-w-[min(176px,calc(100vw-32px))] gap-1.5 rounded-[5px] border border-[var(--border)] bg-[var(--panel)] p-1.5 shadow-[0_12px_28px_rgb(0_0_0/35%)]"
          data-testid={`transform-popup-${props.nodeId}-${props.attrName}`}
        >
          <Show
            when={transformItems().length > 0}
            fallback={
              <button
                type="button"
                class="grid h-7 w-full min-w-5.5 cursor-pointer place-items-center rounded-[5px] border border-[var(--soft-border)] bg-[var(--panel-2)]"
                data-testid={`transform-insert-empty-${props.nodeId}-${props.attrName}`}
                onClick={() => setInsertMenu(0)}
              >
                <PlusIcon {...decorativeIconProps} />
              </button>
            }
          >
            <div class="grid gap-0.75" data-testid={`transform-list-${props.nodeId}-${props.attrName}`}>
              <For each={transformItems()}>
                {(item, index) => (
                  <div
                    class="relative grid grid-cols-[24px_minmax(0,1fr)_22px] items-center gap-0.75"
                    data-testid={`transform-row-${props.nodeId}-${index()}`}
                  >
                    <button
                      type="button"
                      class="inline-grid h-5.5 min-w-5.5 cursor-pointer place-items-center rounded-[5px] border border-[var(--soft-border)] bg-[var(--panel-2)]"
                      title={item.type}
                      data-testid={`transform-type-button-${props.nodeId}-${index()}`}
                      onClick={() => setActiveTransformMenu(activeTransformMenu() === index() ? undefined : index())}
                    >
                      <Dynamic component={transformIcon(item.type)} {...decorativeIconProps} />
                    </button>
                    <input
                      class="block h-5.5 min-h-5.5 min-w-0 rounded-[5px] border border-[var(--soft-border)] bg-[#080b12] px-1.25 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]"
                      aria-label={`${item.type} values`}
                      data-testid={`transform-values-input-${props.nodeId}-${index()}`}
                      value={item.body}
                      onChange={(event) => updateTransformBody(index(), event.currentTarget.value)}
                    />
                    <button
                      type="button"
                      class="static grid h-5.5 min-w-5.5 flex-[0_0_auto] cursor-pointer place-items-center self-start rounded-[5px] border border-transparent bg-transparent p-0 hover:border-[var(--soft-border)] hover:bg-[var(--panel-2)] focus-visible:border-[var(--soft-border)] focus-visible:bg-[var(--panel-2)]"
                      title="Transform actions"
                      data-testid={`transform-actions-button-${props.nodeId}-${index()}`}
                      onClick={() => setActiveTransformMenu(activeTransformMenu() === index() ? undefined : index())}
                    >
                      <SmallMoreIcon {...decorativeIconProps} />
                    </button>
                    <Show when={activeTransformMenu() === index()}>
                      <div
                        class="absolute top-6 right-0 z-50 grid min-w-35.5 gap-0.75 rounded-[5px] border border-[var(--border)] bg-[var(--panel)] p-1 shadow-[0_10px_24px_rgb(0_0_0/34%)]"
                        data-testid={`transform-actions-menu-${props.nodeId}-${index()}`}
                      >
                        <button
                          class="flex min-h-5.5 w-full cursor-pointer items-center justify-start gap-1.5 rounded-[5px] border border-[var(--soft-border)] bg-[var(--panel-2)] px-1.5 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] text-[var(--text)]"
                          type="button"
                          data-testid={`transform-insert-after-${props.nodeId}-${index()}`}
                          onClick={() => setInsertMenu(index() + 1)}
                        >
                          <InsertAfterIcon {...decorativeIconProps} /> {t('Insert after')}
                        </button>
                        <button
                          class="flex min-h-5.5 w-full cursor-pointer items-center justify-start gap-1.5 rounded-[5px] border border-[var(--soft-border)] bg-[var(--panel-2)] px-1.5 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] text-[var(--text)]"
                          type="button"
                          data-testid={`transform-insert-before-${props.nodeId}-${index()}`}
                          onClick={() => setInsertMenu(index())}
                        >
                          <InsertBeforeIcon {...decorativeIconProps} /> {t('Insert before')}
                        </button>
                        <button
                          class="flex min-h-5.5 w-full cursor-pointer items-center justify-start gap-1.5 rounded-[5px] border border-[var(--soft-border)] bg-[var(--panel-2)] px-1.5 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] text-[var(--text)]"
                          type="button"
                          data-testid={`transform-delete-${props.nodeId}-${index()}`}
                          onClick={() => deleteTransform(index())}
                        >
                          <DeleteIcon {...decorativeIconProps} /> {t('Delete')}
                        </button>
                      </div>
                    </Show>
                  </div>
                )}
              </For>
              <button
                type="button"
                class="grid h-7 w-auto min-w-5.5 cursor-pointer place-items-center rounded-[5px] border border-[var(--soft-border)] bg-[var(--panel-2)]"
                data-testid={`transform-insert-at-end-${props.nodeId}-${props.attrName}`}
                onClick={() => setInsertMenu(transformItems().length)}
              >
                <PlusIcon {...decorativeIconProps} />
              </button>
            </div>
          </Show>
          <Show when={insertMenu() !== undefined}>
            <div
              class="static grid min-w-0 gap-0.75 rounded-[5px] border border-[var(--border)] bg-[var(--panel)] p-1"
              data-testid={`transform-insert-menu-${props.nodeId}-${props.attrName}`}
            >
              <div class="px-1.5 py-0.5 text-[11px] text-[var(--muted)]">{t('New transform')}</div>
              <For each={transformTypes}>
                {(type) => (
                  <button
                    class="flex min-h-5.5 w-full cursor-pointer items-center justify-start gap-1.5 rounded-[5px] border border-[var(--soft-border)] bg-[var(--panel-2)] px-1.5 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] text-[var(--text)]"
                    type="button"
                    data-testid={`transform-insert-type-${props.nodeId}-${type}`}
                    onClick={() => {
                      const index = insertMenu();

                      if (index !== undefined) {
                        insertTransform(index, type);
                      }
                    }}
                  >
                    <Dynamic component={transformIcon(type)} {...decorativeIconProps} /> {type}
                  </button>
                )}
              </For>
            </div>
          </Show>
          <div
            class="grid grid-cols-[repeat(3,44px)] gap-1"
            data-testid={`transform-matrix-preview-${props.nodeId}-${props.attrName}`}
          >
            <input
              class="block h-5 min-h-5 w-11 min-w-0 rounded border border-[var(--soft-border)] bg-[var(--panel)] px-1 font-['GodSVG_Mono',ui-monospace,monospace] text-[10px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]"
              value={formatMiniNumber(finalMatrix().a)}
              readonly
              aria-label="matrix a"
              data-testid={`transform-matrix-a-${props.nodeId}-${props.attrName}`}
            />
            <input
              class="block h-5 min-h-5 w-11 min-w-0 rounded border border-[var(--soft-border)] bg-[var(--panel)] px-1 font-['GodSVG_Mono',ui-monospace,monospace] text-[10px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]"
              value={formatMiniNumber(finalMatrix().c)}
              readonly
              aria-label="matrix c"
              data-testid={`transform-matrix-c-${props.nodeId}-${props.attrName}`}
            />
            <input
              class="block h-5 min-h-5 w-11 min-w-0 rounded border border-[var(--soft-border)] bg-[var(--panel)] px-1 font-['GodSVG_Mono',ui-monospace,monospace] text-[10px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]"
              value={formatMiniNumber(finalMatrix().e)}
              readonly
              aria-label="matrix e"
              data-testid={`transform-matrix-e-${props.nodeId}-${props.attrName}`}
            />
            <input
              class="block h-5 min-h-5 w-11 min-w-0 rounded border border-[var(--soft-border)] bg-[var(--panel)] px-1 font-['GodSVG_Mono',ui-monospace,monospace] text-[10px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]"
              value={formatMiniNumber(finalMatrix().b)}
              readonly
              aria-label="matrix b"
              data-testid={`transform-matrix-b-${props.nodeId}-${props.attrName}`}
            />
            <input
              class="block h-5 min-h-5 w-11 min-w-0 rounded border border-[var(--soft-border)] bg-[var(--panel)] px-1 font-['GodSVG_Mono',ui-monospace,monospace] text-[10px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]"
              value={formatMiniNumber(finalMatrix().d)}
              readonly
              aria-label="matrix d"
              data-testid={`transform-matrix-d-${props.nodeId}-${props.attrName}`}
            />
            <input
              class="block h-5 min-h-5 w-11 min-w-0 rounded border border-[var(--soft-border)] bg-[var(--panel)] px-1 font-['GodSVG_Mono',ui-monospace,monospace] text-[10px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]"
              value={formatMiniNumber(finalMatrix().f)}
              readonly
              aria-label="matrix f"
              data-testid={`transform-matrix-f-${props.nodeId}-${props.attrName}`}
            />
          </div>
        </div>
      </Show>
    </div>
  );
}

function isRootEditorAttribute(name: string): boolean {
  return rootEditorAttributes.some((attributeName) => attributeName === name);
}

/**
 * Commits an input's value and shows the committed text in the field. The committed value may differ from what was
 * typed (clamped, normalized) while the model stays the same, and then no reactive update would replace the text.
 */
function commitInput(input: HTMLInputElement, value: string, commit: (value: string) => void): void {
  commit(value);
  input.value = value;
}

function listValues(value: string, count: number, fallback: readonly string[] = []): string[] {
  const values = value.split(/[\s,]+/).filter(Boolean);

  return Array.from({ length: count }, (_, index) => values[index] ?? fallback[index] ?? '0');
}

function parsePathParamValue(value: string): number {
  const parsed = Number.parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function pathParamInputWidth(value: string, paramName: string): string {
  if (paramName === 'large' || paramName === 'sweep') {
    return '20px';
  }

  const width = Math.min(58, Math.max(26, value.length * 6 + 12));
  return `${width}px`;
}

/** GodSVG's name of a path command with its coordinate mode, such as "Move to (Absolute)", translated by `t`. */
function pathCommandDescription(command: string, t: (message: string) => string): string {
  const descriptions: Record<string, string> = {
    A: 'Elliptical Arc to',
    C: 'Cubic Bezier to',
    H: 'Horizontal Line to',
    L: 'Line to',
    M: 'Move to',
    Q: 'Quadratic Bezier to',
    S: 'Shorthand Cubic Bezier to',
    T: 'Shorthand Quadratic Bezier to',
    V: 'Vertical Line to',
    Z: 'Close Path'
  };
  const relation = command === command.toLowerCase() ? 'Relative' : 'Absolute';

  const description = descriptions[command.toUpperCase()];

  return `${description ? t(description) : command} (${t(relation)})`;
}

function parseTransformItems(value: string): readonly TransformItem[] {
  const items: TransformItem[] = [];

  for (const match of value.matchAll(/([a-zA-Z]+)\(([^)]*)\)/g)) {
    const [, type, body] = match;

    if (isTransformType(type)) {
      items.push({ type, body: body ?? '' });
    }
  }

  return items;
}

function isTransformType(value: string | undefined): value is TransformType {
  return value !== undefined && transformTypes.some((type) => type === value);
}

function createTransformItem(type: TransformType): TransformItem {
  switch (type) {
    case 'matrix':
      return { type, body: '1 0 0 1 0 0' };
    case 'translate':
      return { type, body: '0 0' };
    case 'rotate':
      return { type, body: '0 0 0' };
    case 'scale':
      return { type, body: '1 1' };
    case 'skewX':
    case 'skewY':
      return { type, body: '0' };
  }
}

function transformIcon(type: TransformType): SvgIcon {
  switch (type) {
    case 'matrix':
      return MatrixIcon;
    case 'translate':
      return TranslateIcon;
    case 'rotate':
      return RotateIcon;
    case 'scale':
      return ScaleIcon;
    case 'skewX':
      return SkewXIcon;
    case 'skewY':
      return SkewYIcon;
  }
}

function formatMiniNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }

  const rounded = Math.round(value * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, '').replace(/\.$/, '');
}
