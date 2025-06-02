export const ToolSettingsPanel = (props: { isActive?: boolean }) => {
  return (
    <div
      class="w-30 absolute top-full flex -translate-y-10 flex-col rounded border  border-black bg-white p-1 text-xs transition-transform [.active_&]:translate-y-0"
      classList={{ 'pointer-events-auto': props.isActive, 'pointer-events-none': !props.isActive }}
    >
      Tools settings
      <input type="range"></input>
      <input type="range"></input>
    </div>
  );
};
