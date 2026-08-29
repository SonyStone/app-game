export const ToolSettingsPanel = (props: { isActive?: boolean }) => {
  return (
    <div
      class={[
        'absolute top-full flex w-30 -translate-y-10 flex-col rounded border border-black bg-white p-1 text-xs transition-transform in-[.active]:translate-y-0',
        { 'pointer-events-auto': Boolean(props.isActive), 'pointer-events-none': !props.isActive }
      ]}
    >
      Tools settings
      <input type="range"></input>
      <input type="range"></input>
    </div>
  );
};
