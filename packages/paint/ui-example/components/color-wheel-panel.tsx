export const ColorWheelPanel = (props: { isActive?: boolean }) => {
  return (
    <div
      class="w-30 h-30 absolute bottom-full flex translate-y-10 flex-col gap-1 rounded border border-black bg-white p-1 text-xs transition-transform [.active_&]:translate-y-0"
      classList={{ 'pointer-events-auto': props.isActive, 'pointer-events-none': !props.isActive }}
    >
      Color wheel
      <div class="flex min-h-0 place-content-center place-items-center overflow-hidden">
        {(() => {
          const spread = 15;
          return (
            <svg viewBox="0 0 100 100" height="100%">
              <defs>
                <filter id="blur" color-interpolation-filters="linear" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation={spread} />
                </filter>
                <mask id="circle">
                  <circle cx="50" cy="50" r="50" fill="white" />
                </mask>
              </defs>
              {/* <g mask="url(#circle)" filter="url(#blur)">
      <rect x="-10" width="110" height="110" fill="blue" />
      <rect x="50" width="60" height="110" fill="yellow" />
      <polygon points="50,50, 60,110, 40,110" fill="#0f8" />
      <polygon points="0,0, 100,0, 100,20, 50,50, 0,20" fill="red" />
      <polygon points="0,10, 50,50, 0,30" fill="#f0f" />
      <polygon points="100,10, 100,30, 50,50" fill="#f80" />
      </g> */}
              <g filter="url(#blur)">
                <rect x={0 - spread} y={0 - spread} width={100 + spread} height={100 + spread} fill="white" />
                <rect x={50 - spread} y={0 - spread} width={50 + spread * 2} height={100 + spread * 2} fill="#0f0" />
                <rect
                  x={0 - spread}
                  y={50 + 10 - spread}
                  width={100 + spread * 2}
                  height={50 + spread * 2}
                  fill="black"
                />
                {/* <polygon points="50,50, 60,110, 40,110" fill="#0f8" /> */}
                {/* <polygon points="0,0, 100,0, 100,20, 50,50, 0,20" fill="red" /> */}
                {/* <polygon points="0,10, 50,50, 0,30" fill="#f0f" /> */}
                {/* <polygon points="100,10, 100,30, 50,50" fill="#f80" /> */}
              </g>
            </svg>
          );
        })()}
      </div>
    </div>
  );
};
