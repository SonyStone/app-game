export default function SvgAnimations() {
  const path = [
    'M 50 110' +
      'a 50 50 0 0 1 50 -50' +
      'l 0 0' +
      'a 50 50 0 0 1 50 50' +
      'l 0 0' +
      'a 50 50 0 0 1 -50 50' +
      'a 50 50 0 0 1 -50 -50' +
      'z' +
      'm 40 0' +
      'l 10 10' +
      'l 10 -10' +
      'l -10 -10' +
      'l -10 10' +
      'z',
    'M 50 110' +
      'a 50 50 0 0 1 50 -50' +
      'l 30 0' +
      'a 20 20 0 0 1 20 20' +
      'l 0 30' +
      'a 50 50 0 0 1 -50 50' +
      'a 50 50 0 0 1 -50 -50' +
      'z' +
      'm 75 -35' +
      'l 10 10' +
      'l 10 -10' +
      'l -10 -10' +
      'l -10 10' +
      'z'
  ];

  return (
    <div>
      <div class="p-4 text-sm">
        <h1>SVG Animations</h1>
        <p>
          This example demonstrates SVG animations using the <code>transition-[d]</code> utility class. Hover over the
          SVG to see the path change.
        </p>
      </div>
      <svg class="fixed right-0 top-0 z-10 h-screen w-screen touch-none">
        {/* Add your SVG animations here */}
        {/* Example: <Donut x={100} y={100} inner_radius={50} outer_radius={75} /> */}

        <path
          fill="red"
          stroke="black"
          stroke-width={2}
          d={path[0]}
          style={{
            '--path': `"${path[1]}"`
          }}
          class="duration-250 transition-ease-in-out transition-[d] hover:[d:path(var(--path))]"
        ></path>
      </svg>
    </div>
  );
}
