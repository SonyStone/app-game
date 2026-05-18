export function RoundOutBordersExample() {
  return (
    <div class="[] flex flex-col gap-3 bg-neutral-950 p-2 text-white">
      {/* Inset Block End (Bottom) */}
      <div class="flex gap-4">
        <div class="outward-b outward-bg-neutral-700 h-5 w-5 bg-neutral-700"></div>
        <div class="outward-b-sm outward-border-1 outward-border-white outward-bg-neutral-700 h-5 w-5 bg-neutral-700"></div>
        <div class="outward-b-lg outward-border-3 outward-border-white outward-bg-neutral-700 h-5 w-5 bg-neutral-700"></div>
      </div>
      {/* Inset Block Start (Top) */}
      <div class="flex gap-4">
        <div class="outward-t outward-bg-neutral-700 h-5 w-5 bg-neutral-700"></div>
        <div class="outward-t-sm outward-border-1 outward-border-white outward-bg-neutral-700 h-5 w-5 bg-neutral-700"></div>
        <div class="outward-t-lg outward-border-3 outward-border-white outward-bg-neutral-700 h-5 w-5 bg-neutral-700"></div>
      </div>
      {/* Inset Inline End (Right) */}
      <div class="flex gap-4">
        <div class="outward-r outward-bg-neutral-700 h-5 w-5 bg-neutral-700"></div>
        <div class="outward-r-sm outward-border-1 outward-border-white outward-bg-neutral-700 h-5 w-5 bg-neutral-700"></div>
        <div class="outward-r-lg outward-border-3 outward-border-white outward-bg-neutral-700 h-5 w-5 bg-neutral-700"></div>
      </div>
      {/* Inset Inline Start (Left) */}
      <div class="flex gap-4">
        <div class="outward-l outward-bg-neutral-700 h-5 w-5 bg-neutral-700"></div>
        <div class="outward-l-sm outward-border-1 outward-border-white outward-bg-neutral-700 h-5 w-5 bg-neutral-700"></div>
        <div class="outward-l-lg outward-border-3 outward-border-white outward-bg-neutral-700 h-5 w-5 bg-neutral-700"></div>
      </div>
    </div>
  );
}
