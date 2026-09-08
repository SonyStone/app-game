import { supportsAirbrush } from '@app-game/abr-brush/stroke';
import { For, Show, type StoreSetter } from 'solid-js';
import brushIcon from '../../../../assets/icons/tool-options/brush.svg?url';
import opacityIcon from '../../../../assets/icons/tool-options/droplet-half-2.svg?url';
import sizeIcon from '../../../../assets/icons/tool-options/pencil.svg?url';
import settingsIcon from '../../../../assets/icons/tool-options/settings.svg?url';
import airbrushIcon from '../../../../assets/icons/tool-options/spray.svg?url';
import { brushToolIcon } from '../../../../components/BrushToolIcon';
import { OptionMenu } from '../../../../components/OptionMenu';
import type { BrushFormValues } from '../../brush-form-schema';
import type { ColorMixingPreference } from '../../color-mixing';
import { settingGroups, smudgeModes, type SettingField } from '../../settings-fields';
import { toolbarToolFields, toolOptionVisible } from '../../tool-options';

/** Controlled Photoshop-style tool options. All edits use the inspector's validated, undoable preset writer. */
export function ToolOptionsBar(props: {
  values: BrushFormValues;
  /** Application working space, kept separate from the ABR Mode descriptor. */
  colorMixing?: ColorMixingPreference;
  setValues: StoreSetter<BrushFormValues>;
  /** Opens the existing detailed settings without creating another editor state. */
  onSettings: (category: 'brush-tip' | 'smoothing') => void;
}) {
  const updateTool = (key: keyof BrushFormValues['tool'], value: string | number | boolean) =>
    props.setValues((draft) => {
      Object.assign(draft.tool, { [key]: value });
    });
  return (
    <div class="abr-tool-options" role="group" aria-label="Brush tool options">
      <For each={toolbarToolFields.filter((key) => key !== 'pressureOverridesSize')}>
        {(key) => (
          <Show when={toolOptionVisible(props.values.tool, key)}>
            <Show
              when={key === 'pressureOverridesOpacity'}
              fallback={
                <ToolField
                  field={settingGroups.tool[key]}
                  value={props.values.tool[key]}
                  options={
                    key === 'mode' && ['SmTl', 'ShTl', 'BlTl'].includes(props.values.tool.type)
                      ? settingGroups.tool.mode.options?.filter((option) =>
                          smudgeModes.some((mode) => mode === option.value)
                        )
                      : settingGroups.tool[key].options
                  }
                  onChange={(value) => updateTool(key, value)}
                />
              }
            >
              <OptionToggle
                label="Always use pressure for opacity"
                icon={opacityIcon}
                pressed={props.values.tool.pressureOverridesOpacity}
                onClick={() => updateTool('pressureOverridesOpacity', !props.values.tool.pressureOverridesOpacity)}
              />
            </Show>
            <Show when={key === 'type'}>
              <button
                type="button"
                class="abr-tool-icon"
                aria-label="Open Brush Settings"
                title="Brush Settings"
                onClick={() => props.onSettings('brush-tip')}
              >
                <img src={brushIcon} alt="" />
              </button>
            </Show>
          </Show>
        )}
      </For>
      <Show when={props.colorMixing}>
        {(preference) => (
          <label
            class="abr-tool-field"
            title="Smooth color blends Normal-mode paint and processes Smudge, Blur and Sharpen in linear light. Mixer Brush retains its own mixing model. This preference is not exported in ABR files."
          >
            <span>Color mixing:</span>
            <OptionMenu
              label="Brush color mixing"
              value={preference().value}
              options={[
                { value: 'linear', label: 'Smooth color' },
                { value: 'classic', label: 'Classic' }
              ]}
              onChange={(value) => preference().onChange(value === 'linear' ? 'linear' : 'classic')}
            />
          </label>
        )}
      </Show>
      <Show when={supportsAirbrush(props.values.tool)}>
        <OptionToggle
          label="Airbrush"
          icon={airbrushIcon}
          pressed={props.values.useBuildUp}
          onClick={() =>
            props.setValues((draft) => {
              draft.useBuildUp = !draft.useBuildUp;
            })
          }
        />
      </Show>
      <div class="abr-tool-cluster">
        <CompactNumber
          label="Smoothing"
          value={props.values.smoothing.amount}
          min={0}
          max={100}
          unit="%"
          disabled={!props.values.useSmoothing}
          onChange={(value) =>
            props.setValues((draft) => {
              draft.smoothing.amount = value;
            })
          }
        />
        <button
          type="button"
          class="abr-tool-icon"
          aria-label="Smoothing options"
          title="Smoothing options"
          onClick={() => props.onSettings('smoothing')}
        >
          <img src={settingsIcon} alt="" />
        </button>
      </div>
      <CompactNumber
        label="Tip angle"
        displayLabel="Angle"
        value={props.values.angle}
        min={-180}
        max={180}
        unit="°"
        onChange={(value) =>
          props.setValues((draft) => {
            draft.angle = value;
          })
        }
      />
      <Show when={toolOptionVisible(props.values.tool, 'pressureOverridesSize')}>
        <OptionToggle
          label="Always use pressure for size"
          icon={sizeIcon}
          pressed={props.values.tool.pressureOverridesSize}
          onClick={() => updateTool('pressureOverridesSize', !props.values.tool.pressureOverridesSize)}
        />
      </Show>
    </div>
  );
}

/** Keep labels/ranges/native choices supplied by the descriptor bindings, including unknown imported choices. */
function ToolField(props: {
  field: SettingField;
  value: string | number | boolean;
  options: SettingField['options'];
  onChange: (value: string | number) => void;
}) {
  return (
    <Show
      when={props.field.kind === 'number'}
      fallback={
        <label class="abr-tool-field">
          <span>{props.field.label === 'Eraser Mode' ? 'Mode' : props.field.label}:</span>
          <OptionMenu
            label={props.field.label}
            value={String(props.value)}
            options={(props.options ?? []).map((option) => ({
              ...option,
              value: String(option.value),
              icon: props.field.label === 'Tool' ? brushToolIcon(String(option.value)) : undefined,
              separatorBefore:
                props.field.label === 'Mode' && ['Drkn', 'Lghn', 'Ovrl', 'Dfrn', 'H   '].includes(String(option.value))
            }))}
            onChange={(value) => props.onChange(props.field.kind === 'control' ? Number(value) : String(value))}
          />
        </label>
      }
    >
      <CompactNumber
        label={props.field.label}
        displayLabel={props.field.label.replace(' (%)', '')}
        value={Number(props.value)}
        min={props.field.min ?? 0}
        max={props.field.max ?? 100}
        unit="%"
        onChange={props.onChange}
      />
    </Show>
  );
}

/** Invalid or temporarily empty numeric text never changes a preset; blur restores the last valid value. */
function CompactNumber(props: {
  label: string;
  displayLabel?: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label class="abr-tool-field abr-tool-number">
      <span>{props.displayLabel ?? props.label}:</span>
      <span class="abr-tool-number-box">
        <input
          type="number"
          aria-label={props.label}
          min={props.min}
          max={props.max}
          step={1}
          value={props.value}
          disabled={props.disabled}
          onInput={(event) => {
            const input = event.currentTarget;
            if (input.value !== '' && input.validity.valid && Number.isFinite(input.valueAsNumber))
              props.onChange(input.valueAsNumber);
          }}
          onBlur={(event) => {
            event.currentTarget.value = String(props.value);
          }}
        />
        <span aria-hidden="true">{props.unit}</span>
      </span>
    </label>
  );
}

/** Native button semantics expose the same toggle state to keyboard, touch and assistive technology. */
function OptionToggle(props: { label: string; icon: string; pressed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      class="abr-tool-icon"
      aria-label={props.label}
      title={props.label}
      aria-pressed={props.pressed ? 'true' : 'false'}
      onClick={props.onClick}
    >
      <img src={props.icon} alt="" />
    </button>
  );
}
