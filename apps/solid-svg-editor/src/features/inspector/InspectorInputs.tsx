import { createMemo, createSignal, For, Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';

import { createSvgCapabilityRegistry, type SvgCapabilityRegistry } from '../../editor/capabilities';
import type { EditorCommand } from '../../editor/commands';
import {
  createConvertPathCommandCommand,
  createDeletePathCommandIntent,
  createInsertPathCommandIntent,
  createTogglePathCommandRelativeCommand,
  createUpdatePathAnchorCommand,
  type PathCommandEditIntent
} from '../../editor/commands/pathCommands';
import {
  createAddPointCommand,
  createDeletePointCommand,
  createUpdatePointCommand
} from '../../editor/commands/pointCommands';
import { parseTransformList } from '../../editor/geometry';
import type { SvgAttributeControlContext } from '../../editor/kernel';
import {
  pathAnchorFromSelectionTargets,
  pathAnchorSelectionTarget,
  pathCommandFromSelectionTargets,
  pathCommandSelectionTarget,
  type SelectionTarget
} from '../../editor/selection-targets';
import { coreSvgCapabilityContribution } from '../../editor/svg-capabilities/coreSvgContribution';
import { decorativeIconProps, type SvgIcon } from '../../editor/svg-icon';
import {
  clampNumericAttribute,
  normalizeColorInput,
  orderedAttributes
} from '../../editor/tree-utils';
import {
  commandParameters,
  formatPathNumber,
  parsePathData,
  parsePoints,
  pathCommandLetters,
  type PathCommand
} from '../../path-data';
import { getAttribute, type SvgAttribute, type SvgElementNode } from '../../svg-model';
import DeleteIcon from '../ui/icons/Delete.svg';
import InsertAfterIcon from '../ui/icons/InsertAfter.svg';
import PlusIcon from '../ui/icons/Plus.svg';
import ArrowIcon from './icons/Arrow.svg';
import InsertBeforeIcon from './icons/InsertBefore.svg';
import { createCoreInspectorControlContribution } from './inspectorControlContribution';
import MatrixIcon from './icons/Matrix.svg';
import RotateIcon from './icons/Rotate.svg';
import ScaleIcon from './icons/Scale.svg';
import SkewXIcon from './icons/SkewX.svg';
import SkewYIcon from './icons/SkewY.svg';
import SmallMoreIcon from './icons/SmallMore.svg';
import TranslateIcon from './icons/Translate.svg';

const rootEditorAttributes = ['width', 'height', 'viewBox', 'xmlns'] as const;
const transformTypes = ['matrix', 'translate', 'rotate', 'scale', 'skewX', 'skewY'] as const;

export const inspectorSvgCapabilities = createSvgCapabilityRegistry([
  coreSvgCapabilityContribution,
  createCoreInspectorControlContribution(renderDefaultAttributeControl)
]);

type TransformType = (typeof transformTypes)[number];
type TransformItem = {
  readonly type: TransformType;
  readonly body: string;
};

function renderDefaultAttributeControl(context: SvgAttributeControlContext) {
  return <DefaultAttributeControl context={context} />;
}

export function RootElementEditor(props: {
  readonly root: SvgElementNode;
  readonly capabilities?: SvgCapabilityRegistry;
  readonly updateElementAttribute: (nodeId: string, name: string, value: string) => void;
  readonly dispatchCommand: (command: EditorCommand) => void;
  readonly selectTarget: (target: SelectionTarget, event?: MouseEvent | PointerEvent) => void;
}) {
  const capabilities = () => props.capabilities ?? inspectorSvgCapabilities;
  const rootValue = (name: string) => getAttribute(props.root, name, true) || capabilities().getAttributeDefault(name);
  const viewBoxValues = createMemo(() =>
    listValues(rootValue('viewBox'), 4, listValues(capabilities().getAttributeDefault('viewBox'), 4))
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
              <AttributeControl
                node={props.root}
                attr={attr}
                capabilities={capabilities()}
                root={props.root}
                dispatchCommand={props.dispatchCommand}
                selectTarget={props.selectTarget}
                updateElementAttribute={props.updateElementAttribute}
              />
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
              props.updateElementAttribute(
                props.root.id,
                'width',
                clampNumericAttribute('width', event.currentTarget.value, capabilities())
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
              props.updateElementAttribute(
                props.root.id,
                'height',
                clampNumericAttribute('height', event.currentTarget.value, capabilities())
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
            <For each={viewBoxValues()}>
              {(value, index) => (
                <input
                  class="block h-5.5 min-h-5.5 w-12 min-w-0 rounded-[5px] border border-[var(--soft-border)] bg-[#080b12] px-1.25 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]"
                  name={`${props.root.id}-viewbox-${index()}`}
                  aria-label={`viewBox ${index() + 1}`}
                  data-testid={`root-viewbox-input-${index()}`}
                  value={value}
                  onChange={(event) =>
                    updateViewBoxPart(
                      index(),
                      clampNumericAttribute(index() < 2 ? 'x' : 'width', event.currentTarget.value, capabilities())
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
  readonly root?: SvgElementNode;
  readonly node: SvgElementNode;
  readonly capabilities?: SvgCapabilityRegistry;
  readonly updateElementAttribute: (nodeId: string, name: string, value: string) => void;
  readonly dispatchCommand: (command: EditorCommand) => void;
  readonly selectedTargets: readonly SelectionTarget[];
  readonly selectTarget: (target: SelectionTarget, event?: MouseEvent | PointerEvent) => void;
}) {
  const capabilities = () => props.capabilities ?? inspectorSvgCapabilities;
  const root = () => props.root ?? props.node;
  const attrs = createMemo(() => orderedAttributes(props.node, capabilities()));
  const unknownAttrs = createMemo(() =>
    attrs().filter((attr) => !capabilities().isAttributeRecognized(props.node.name, attr.name))
  );
  const compactAttrs = createMemo(() =>
    attrs().filter((attr) => capabilities().isCompactAttribute(props.node.name, attr.name))
  );
  const pathDataAttr = createMemo(() =>
    attrs().find((attr) => capabilities().getAttributeType(attr.name) === 'pathdata')
  );
  const pointsAttr = createMemo(() =>
    attrs().find((attr) => capabilities().getAttributeType(attr.name) === 'list' && attr.name === 'points')
  );

  return (
    <div class="grid gap-0.5 p-1" data-testid={`attribute-grid-${props.node.id}`}>
      <Show when={unknownAttrs().length > 0}>
        <div
          class="flex min-w-0 flex-wrap items-center gap-0.75 pb-0.5"
          data-testid={`unknown-attributes-${props.node.id}`}
        >
          <For each={unknownAttrs()}>
            {(attr) => (
              <AttributeControl
                node={props.node}
                attr={attr}
                capabilities={capabilities()}
                root={root()}
                dispatchCommand={props.dispatchCommand}
                selectTarget={props.selectTarget}
                updateElementAttribute={props.updateElementAttribute}
              />
            )}
          </For>
        </div>
      </Show>
      <div class="flex min-w-0 flex-wrap items-center gap-0.75" data-testid={`compact-attributes-${props.node.id}`}>
        <For each={compactAttrs()}>
          {(attr) => (
            <AttributeControl
              node={props.node}
              attr={attr}
              capabilities={capabilities()}
              root={root()}
              dispatchCommand={props.dispatchCommand}
              selectTarget={props.selectTarget}
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
            dispatchCommand={props.dispatchCommand}
          />
        )}
      </Show>
      <Show when={pathDataAttr()}>
        {(attr) => (
          <PathDataEditor
            node={props.node}
            value={attr().value}
            update={(value) => props.updateElementAttribute(props.node.id, attr().name, value)}
            dispatchCommand={props.dispatchCommand}
            selectedTargets={props.selectedTargets}
            selectTarget={props.selectTarget}
          />
        )}
      </Show>
    </div>
  );
}

function AttributeControl(props: {
  readonly root: SvgElementNode;
  readonly node: SvgElementNode;
  readonly attr: SvgAttribute;
  readonly capabilities?: SvgCapabilityRegistry;
  readonly dispatchCommand: (command: EditorCommand) => void;
  readonly selectTarget: (target: SelectionTarget, event?: MouseEvent | PointerEvent) => void;
  readonly updateElementAttribute: (nodeId: string, name: string, value: string) => void;
}) {
  const capabilities = () => props.capabilities ?? inspectorSvgCapabilities;
  const capability = () => capabilities().getAttribute(props.attr.name);
  const type = () => capability().type;
  const update = (value: string) => props.updateElementAttribute(props.node.id, props.attr.name, value);
  const context = (): SvgAttributeControlContext => ({
    root: props.root,
    node: props.node,
    name: props.attr.name,
    value: props.attr.value,
    capabilities: capabilities(),
    dispatchCommand: props.dispatchCommand,
    selectTarget: props.selectTarget,
    update
  });
  const control = () =>
    capabilities().renderAttributeControl(context()) ?? (
      <DefaultAttributeControl context={context()} capabilities={capabilities()} />
    );

  return (
    <div
      class="h-5.5 min-w-0"
      classList={{
        'w-20.5': type() === 'color',
        'w-20.25': type() === 'enum',
        'w-28': type() === 'href' || type() === 'id' || type() === 'unknown',
        'w-13.5': type() === 'list' || type() === 'numeric',
        'w-40.5': type() === 'transform-list'
      }}
      title={props.attr.name}
      data-testid={`attribute-control-${props.node.id}-${props.attr.name}`}
    >
      {control()}
    </div>
  );
}

function DefaultAttributeControl(props: {
  readonly context: SvgAttributeControlContext;
  readonly capabilities?: SvgCapabilityRegistry;
}) {
  const capabilities = () => props.capabilities ?? inspectorSvgCapabilities;
  const capability = () => capabilities().getAttribute(props.context.name);
  const type = () => capability().type;

  return (
    <>
      <Show when={type() === 'numeric' || (type() === 'list' && props.context.name !== 'points')}>
        <input
          class="block h-5.5 min-h-5.5 w-full min-w-0 rounded-[5px] border border-[var(--soft-border)] bg-[#080b12] px-1.25 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]"
          type="text"
          name={`${props.context.node.id}-${props.context.name}`}
          aria-label={props.context.name}
          data-testid={`attribute-input-${props.context.node.id}-${props.context.name}`}
          value={props.context.value}
          placeholder={capability().defaultValue}
          onChange={(event) =>
            props.context.update(clampNumericAttribute(props.context.name, event.currentTarget.value, capabilities()))
          }
        />
      </Show>
      <Show when={type() === 'enum'}>
        <select
          class="block h-5.5 min-h-5.5 w-full min-w-0 rounded-[5px] border border-[var(--soft-border)] bg-[#080b12] px-1.25 pr-4.5 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]"
          name={`${props.context.node.id}-${props.context.name}`}
          aria-label={props.context.name}
          data-testid={`attribute-select-${props.context.node.id}-${props.context.name}`}
          value={props.context.value}
          onChange={(event) => props.context.update(event.currentTarget.value)}
        >
          <For each={capability().enumValues}>{(value) => <option value={value}>{value}</option>}</For>
        </select>
      </Show>
      <Show when={type() === 'color'}>
        <ColorField
          nodeId={props.context.node.id}
          attr={{ name: props.context.name, value: props.context.value }}
          capabilities={capabilities()}
          update={props.context.update}
        />
      </Show>
      <Show when={type() === 'transform-list'}>
        <TransformField
          nodeId={props.context.node.id}
          attrName={props.context.name}
          value={props.context.value}
          update={props.context.update}
        />
      </Show>
      <Show when={['id', 'href', 'unknown'].includes(type())}>
        <input
          class="block h-5.5 min-h-5.5 w-full min-w-0 rounded-[5px] border border-[var(--soft-border)] bg-[#080b12] px-1.25 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]"
          name={`${props.context.node.id}-${props.context.name}`}
          aria-label={props.context.name}
          data-testid={`attribute-input-${props.context.node.id}-${props.context.name}`}
          value={props.context.value}
          placeholder={props.context.name}
          onChange={(event) => props.context.update(event.currentTarget.value)}
        />
      </Show>
    </>
  );
}

function ColorField(props: {
  readonly nodeId: string;
  readonly attr: SvgAttribute;
  readonly capabilities?: SvgCapabilityRegistry;
  readonly update: (value: string) => void;
}) {
  const capabilities = () => props.capabilities ?? inspectorSvgCapabilities;
  const colorValue = () => normalizeColorInput(props.attr.value);
  const swatchValue = () => colorValue() ?? (isCssColorText(props.attr.value) ? props.attr.value : 'transparent');
  const pickerValue = () => colorValue() ?? '#000000';

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
        placeholder={capabilities().getAttributeDefault(props.attr.name)}
        onChange={(event) => props.update(event.currentTarget.value)}
        list={`color-options-${props.nodeId}-${props.attr.name}`}
      />
      <label
        class="relative grid h-5.5 w-5.5 min-w-5.5 cursor-pointer place-items-center overflow-hidden rounded-r-[5px] border border-l-0 border-[var(--soft-border)] bg-[var(--panel-2)] hover:border-[var(--accent)] focus-visible:border-[var(--accent)]"
        title={`${props.attr.name} color`}
        data-testid={`color-picker-label-${props.nodeId}-${props.attr.name}`}
      >
        <span
          class="relative h-4.5 w-3.5 rounded-xs border border-[color-mix(in_srgb,var(--soft-border)_70%,#fff)] [background:var(--swatch-color),linear-gradient(45deg,#8b93a7_25%,transparent_25%_75%,#8b93a7_75%)_0_0/8px_8px,linear-gradient(45deg,transparent_25%,#303747_25%_75%,transparent_75%)_4px_4px/8px_8px]"
          style={{ '--swatch-color': swatchValue() }}
        >
          <Show when={props.attr.value === 'none'}>
            <span class="absolute top-2 -left-0.75 w-5 rotate-[-42deg] border-t-2 border-white" />
          </Show>
        </span>
        <input
          class="absolute inset-0 h-full w-full cursor-pointer border-0 p-0 opacity-0"
          type="color"
          name={`${props.nodeId}-${props.attr.name}-picker`}
          aria-label={`${props.attr.name} picker`}
          data-testid={`color-picker-${props.nodeId}-${props.attr.name}`}
          value={pickerValue()}
          onInput={(event) => props.update(event.currentTarget.value)}
        />
      </label>
      <datalist
        id={`color-options-${props.nodeId}-${props.attr.name}`}
        data-testid={`color-options-${props.nodeId}-${props.attr.name}`}
      >
        <Show when={capabilities().getAttribute(props.attr.name).color.allowNone}>
          <option value="none" />
        </Show>
        <Show when={capabilities().getAttribute(props.attr.name).color.allowUrl}>
          <option value="url(#linearGradient1)" />
        </Show>
        <Show when={capabilities().getAttribute(props.attr.name).color.allowCurrentColor}>
          <option value="currentColor" />
        </Show>
      </datalist>
    </div>
  );
}

function PathDataEditor(props: {
  readonly node: SvgElementNode;
  readonly value: string;
  readonly update: (value: string) => void;
  readonly dispatchCommand: (command: EditorCommand) => void;
  readonly selectedTargets: readonly SelectionTarget[];
  readonly selectTarget: (target: SelectionTarget, event?: MouseEvent | PointerEvent) => void;
}) {
  const commands = createMemo(() => parsePathData(props.value));

  function dispatchPathCommandIntent(intent: PathCommandEditIntent): void {
    props.dispatchCommand(intent.command);

    if (intent.nextTarget) {
      props.selectTarget(intent.nextTarget);
    }
  }

  return (
    <div class="grid w-full min-w-0 gap-0.5" data-testid={`path-data-editor-${props.node.id}`}>
      <input
        class="block h-5.5 min-h-5.5 w-full min-w-0 rounded-[5px] border border-[var(--soft-border)] bg-[#080b12] px-1.25 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]"
        name={`${props.node.id}-d`}
        aria-label="Path data"
        data-testid={`path-data-input-${props.node.id}`}
        value={props.value}
        placeholder="No path data"
        onChange={(event) => props.update(event.currentTarget.value)}
      />
      <div class="grid gap-px" data-testid={`path-command-list-${props.node.id}`}>
        <For each={commands()}>
          {(command, index) => (
            <PathCommandRow
              nodeId={props.node.id}
              command={command}
              index={index()}
              commandCount={commands().length}
              dispatchCommand={props.dispatchCommand}
              selectedTargets={props.selectedTargets}
              selectTarget={props.selectTarget}
            />
          )}
        </For>
        <button
          type="button"
          class="inline-grid h-5.5 min-w-5.5 cursor-pointer place-items-center rounded-[5px] border border-[var(--soft-border)] bg-[var(--panel-2)]"
          title="Add move command"
          data-testid={`path-command-add-${props.node.id}`}
          onClick={() =>
            dispatchPathCommandIntent(
              createInsertPathCommandIntent({
                nodeId: props.node.id,
                index: commands().length - 1,
                command: 'M'
              })
            )
          }
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
  readonly commandCount: number;
  readonly dispatchCommand: (command: EditorCommand) => void;
  readonly selectedTargets: readonly SelectionTarget[];
  readonly selectTarget: (target: SelectionTarget, event?: MouseEvent | PointerEvent) => void;
}) {
  const [menuOpen, setMenuOpen] = createSignal(false);
  const isRelative = () => props.command.command === props.command.command.toLowerCase();
  const parameters = createMemo(() => commandParameters(props.command.command));
  const selected = () => {
    const current = pathCommandFromSelectionTargets(props.selectedTargets);
    return current?.nodeId === props.nodeId && current.index === props.index;
  };
  const selectedParameter = (parameter: string) => {
    const current = pathAnchorFromSelectionTargets(props.selectedTargets);
    return current?.nodeId === props.nodeId && current.commandIndex === props.index && current.parameter === parameter;
  };

  function dispatchCommand(command: EditorCommand): void {
    props.dispatchCommand(command);
    setMenuOpen(false);
  }

  function dispatchPathCommandIntent(intent: PathCommandEditIntent): void {
    props.dispatchCommand(intent.command);

    if (intent.nextTarget) {
      props.selectTarget(intent.nextTarget);
    }

    setMenuOpen(false);
  }

  function selectCurrent(): void {
    props.selectTarget(pathCommandSelectionTarget(props.nodeId, props.index));
  }

  function selectParameter(parameter: string): void {
    props.selectTarget(pathAnchorSelectionTarget(props.nodeId, props.index, parameter));
  }

  function updateParameter(parameter: string, value: number): void {
    props.dispatchCommand(
      createUpdatePathAnchorCommand({
        nodeId: props.nodeId,
        commandIndex: props.index,
        updates: [{ parameter, value }]
      })
    );
  }

  return (
    <div
      class="relative flex min-h-5.5 items-start gap-0.75 overflow-visible rounded-[3px] bg-transparent px-0.75 py-0.5"
      classList={{
        'border-[var(--accent)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_68%,transparent)]': selected()
      }}
      data-testid={`path-command-row-${props.nodeId}-${props.index}`}
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
        class="static mt-0 grid h-4.5 min-h-4.5 w-4.5 min-w-4.5 flex-[0_0_auto] cursor-pointer place-items-center rounded border-2 p-0 font-['GodSVG_Mono',ui-monospace,monospace] text-xs leading-none text-[#fff8ff]"
        classList={{
          'border-[#bd73e6] bg-[#a329cc] hover:border-[#d291f2] hover:bg-[#ad2bd9] focus-visible:border-[#d291f2] focus-visible:bg-[#ad2bd9]':
            isRelative(),
          'border-[#e6ae5c] bg-[#cc7a29] hover:border-[#f2cb91] hover:bg-[#d9822b] focus-visible:border-[#f2cb91] focus-visible:bg-[#d9822b]':
            !isRelative()
        }}
        title={pathCommandDescription(props.command.command)}
        data-testid={`path-command-toggle-${props.nodeId}-${props.index}`}
        onClick={() => {
          selectCurrent();
          props.dispatchCommand(
            createTogglePathCommandRelativeCommand({ nodeId: props.nodeId, commandIndex: props.index })
          );
        }}
      >
        {props.command.command}
      </button>
      <div class="flex min-w-0 flex-[1_1_auto] flex-wrap items-center gap-0.75 overflow-visible">
        <For each={parameters()}>
          {(param) => {
            const value = () => formatPathNumber(props.command.values[param.index] ?? 0);
            const flag = () => param.name === 'large' || param.name === 'sweep';

            return (
              <input
                class="h-4.5 min-h-4.5 min-w-0 flex-[0_0_auto] [appearance:textfield] rounded-[3px] border border-[var(--soft-border)] bg-[#080b12] px-0.75 text-left font-['GodSVG_Mono',ui-monospace,monospace] text-[10px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]"
                classList={{
                  'text-center': flag(),
                  'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,#080b12)]': selectedParameter(param.name)
                }}
                type="text"
                inputMode={flag() ? 'numeric' : 'decimal'}
                name={`${props.nodeId}-command-${props.index}-${param.name}`}
                aria-label={param.name}
                title={param.name}
                data-testid={`path-command-param-${props.nodeId}-${props.index}-${param.name}`}
                value={value()}
                style={{ width: pathParamInputWidth(value(), param.name) }}
                onFocus={() => selectParameter(param.name)}
                onChange={(event) => updateParameter(param.name, parsePathParamValue(event.currentTarget.value))}
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
            onClick={() =>
              dispatchPathCommandIntent(
                createInsertPathCommandIntent({
                  nodeId: props.nodeId,
                  index: props.index,
                  command: props.command.command
                })
              )
            }
          >
            <InsertAfterIcon {...decorativeIconProps} /> Insert after
          </button>
          <div class="grid grid-cols-5 gap-0.75">
            <For each={pathCommandLetters}>
              {(letter) => (
                <button
                  class="grid h-5.5 w-full place-items-center justify-center rounded-[5px] border border-[var(--soft-border)] bg-[var(--panel-2)] p-0 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] text-[var(--text)]"
                  type="button"
                  title={pathCommandDescription(letter)}
                  data-testid={`path-command-convert-${props.nodeId}-${props.index}-${letter}`}
                  onClick={() =>
                    dispatchCommand(
                      createConvertPathCommandCommand({
                        nodeId: props.nodeId,
                        commandIndex: props.index,
                        command: isRelative() ? letter.toLowerCase() : letter
                      })
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
            onClick={() =>
              dispatchPathCommandIntent(
                createDeletePathCommandIntent({
                  nodeId: props.nodeId,
                  commandIndex: props.index,
                  commandCount: props.commandCount
                })
              )
            }
          >
            <DeleteIcon {...decorativeIconProps} /> Delete
          </button>
        </div>
      </Show>
    </div>
  );
}

function PointsEditor(props: {
  readonly nodeId: string;
  readonly value: string;
  readonly update: (value: string) => void;
  readonly dispatchCommand: (command: EditorCommand) => void;
}) {
  const points = createMemo(() => parsePoints(props.value));

  function updateIndexedPoint(index: number, x: number, y: number): void {
    props.dispatchCommand(createUpdatePointCommand({ nodeId: props.nodeId, index, x, y }));
  }

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
        <For each={points()}>
          {(point, index) => (
            <div
              class="grid grid-cols-[24px_1fr_1fr_24px] items-center gap-0.75"
              data-testid={`point-row-${props.nodeId}-${index()}`}
            >
              <span data-testid={`point-index-${props.nodeId}-${index()}`}>{index() + 1}</span>
              <input
                class="block h-5.5 min-h-5.5 w-14.5 min-w-0 rounded-[5px] border border-[var(--soft-border)] bg-[#080b12] px-1.25 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]"
                type="number"
                name={`point-${index()}-x`}
                aria-label="Point x"
                data-testid={`point-x-${props.nodeId}-${index()}`}
                value={point[0]}
                onChange={(event) =>
                  updateIndexedPoint(index(), Number.parseFloat(event.currentTarget.value) || 0, point[1])
                }
              />
              <input
                class="block h-5.5 min-h-5.5 w-14.5 min-w-0 rounded-[5px] border border-[var(--soft-border)] bg-[#080b12] px-1.25 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]"
                type="number"
                name={`point-${index()}-y`}
                aria-label="Point y"
                data-testid={`point-y-${props.nodeId}-${index()}`}
                value={point[1]}
                onChange={(event) =>
                  updateIndexedPoint(index(), point[0], Number.parseFloat(event.currentTarget.value) || 0)
                }
              />
              <button
                class="inline-grid h-5.5 min-w-5.5 cursor-pointer place-items-center rounded-[5px] border border-[var(--soft-border)] bg-[var(--panel-2)]"
                type="button"
                data-testid={`point-delete-${props.nodeId}-${index()}`}
                onClick={() =>
                  props.dispatchCommand(createDeletePointCommand({ nodeId: props.nodeId, index: index() }))
                }
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
          onClick={() => props.dispatchCommand(createAddPointCommand({ nodeId: props.nodeId }))}
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
        placeholder="No transforms"
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
                          <InsertAfterIcon {...decorativeIconProps} /> Insert after
                        </button>
                        <button
                          class="flex min-h-5.5 w-full cursor-pointer items-center justify-start gap-1.5 rounded-[5px] border border-[var(--soft-border)] bg-[var(--panel-2)] px-1.5 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] text-[var(--text)]"
                          type="button"
                          data-testid={`transform-insert-before-${props.nodeId}-${index()}`}
                          onClick={() => setInsertMenu(index())}
                        >
                          <InsertBeforeIcon {...decorativeIconProps} /> Insert before
                        </button>
                        <button
                          class="flex min-h-5.5 w-full cursor-pointer items-center justify-start gap-1.5 rounded-[5px] border border-[var(--soft-border)] bg-[var(--panel-2)] px-1.5 font-['GodSVG_Mono',ui-monospace,monospace] text-[11px] text-[var(--text)]"
                          type="button"
                          data-testid={`transform-delete-${props.nodeId}-${index()}`}
                          onClick={() => deleteTransform(index())}
                        >
                          <DeleteIcon {...decorativeIconProps} /> Delete
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
              <div class="px-1.5 py-0.5 text-[11px] text-[var(--muted)]">New transform</div>
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
              readOnly
              aria-label="matrix a"
              data-testid={`transform-matrix-a-${props.nodeId}-${props.attrName}`}
            />
            <input
              class="block h-5 min-h-5 w-11 min-w-0 rounded border border-[var(--soft-border)] bg-[var(--panel)] px-1 font-['GodSVG_Mono',ui-monospace,monospace] text-[10px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]"
              value={formatMiniNumber(finalMatrix().c)}
              readOnly
              aria-label="matrix c"
              data-testid={`transform-matrix-c-${props.nodeId}-${props.attrName}`}
            />
            <input
              class="block h-5 min-h-5 w-11 min-w-0 rounded border border-[var(--soft-border)] bg-[var(--panel)] px-1 font-['GodSVG_Mono',ui-monospace,monospace] text-[10px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]"
              value={formatMiniNumber(finalMatrix().e)}
              readOnly
              aria-label="matrix e"
              data-testid={`transform-matrix-e-${props.nodeId}-${props.attrName}`}
            />
            <input
              class="block h-5 min-h-5 w-11 min-w-0 rounded border border-[var(--soft-border)] bg-[var(--panel)] px-1 font-['GodSVG_Mono',ui-monospace,monospace] text-[10px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]"
              value={formatMiniNumber(finalMatrix().b)}
              readOnly
              aria-label="matrix b"
              data-testid={`transform-matrix-b-${props.nodeId}-${props.attrName}`}
            />
            <input
              class="block h-5 min-h-5 w-11 min-w-0 rounded border border-[var(--soft-border)] bg-[var(--panel)] px-1 font-['GodSVG_Mono',ui-monospace,monospace] text-[10px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]"
              value={formatMiniNumber(finalMatrix().d)}
              readOnly
              aria-label="matrix d"
              data-testid={`transform-matrix-d-${props.nodeId}-${props.attrName}`}
            />
            <input
              class="block h-5 min-h-5 w-11 min-w-0 rounded border border-[var(--soft-border)] bg-[var(--panel)] px-1 font-['GodSVG_Mono',ui-monospace,monospace] text-[10px] leading-none text-[var(--text)] in-[.theme-light]:bg-[#f8fbff]"
              value={formatMiniNumber(finalMatrix().f)}
              readOnly
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

function listValues(value: string, count: number, fallback: readonly string[] = []): string[] {
  const values = value.split(/[\s,]+/).filter(Boolean);

  return Array.from({ length: count }, (_, index) => values[index] ?? fallback[index] ?? '0');
}

function isCssColorText(value: string): boolean {
  return value !== '' && !value.startsWith('url(') && value !== 'currentColor';
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

function pathCommandDescription(command: string): string {
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

  return `${descriptions[command.toUpperCase()] ?? command} (${relation})`;
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
