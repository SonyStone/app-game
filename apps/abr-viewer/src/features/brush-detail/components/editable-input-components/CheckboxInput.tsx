/** Keeps an inactive option's saved value visible without allowing edits until its mode is available. */
export function CheckboxInput(props: {
  label: string;
  checked: () => boolean;
  setChecked: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label class="flex cursor-pointer items-center gap-2 py-1">
      <input
        type="checkbox"
        disabled={props.disabled}
        checked={props.checked()}
        onChange={(e) => props.setChecked(e.currentTarget.checked)}
        class="border-ps-border bg-ps-bg-dark checked:bg-ps-accent h-4 w-4 rounded"
      />
      <span class="text-ps-text text-sm">{props.label}</span>
    </label>
  );
}
