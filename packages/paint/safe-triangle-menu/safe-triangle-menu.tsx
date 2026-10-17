import { makeEventListener } from '@solid-primitives/event-listener';
import { createSignal, For, onCleanup, Show } from 'solid-js';
import styles from './safe-triangle-menu.module.css';

/**
 * A filter menu with submenus guarded by a safe triangle ("aim guard"), after Kian Bazza's demo for bazza/ui
 * (x.com/kianbazza/status/2024340430381314256):
 *
 * - Hovering an item opens its submenu. The triangle from the pointer to the submenu's near edge follows the pointer
 *   (blue).
 * - A move that lands inside the triangle from the previous pointer position aims at the submenu: the triangle's
 *   apex stays where the aim began (green), the submenu stays open and sibling items do not highlight while the
 *   pointer crosses them.
 * - A move out of the triangle, or resting in it for {@link stallMs}, cancels the aim: the item under the pointer
 *   takes over.
 */
export default function SafeTriangleMenu() {
  const [open, setOpen] = createSignal(true);
  const [showTriangle, setShowTriangle] = createSignal(true);
  /** The item whose submenu shows. */
  const [active, setActive] = createSignal<string>();
  /** The safe triangle: apex and the submenu edge's ends, and whether the pointer is aiming within it. */
  const [triangle, setTriangle] = createSignal<{ apex: Point; top: Point; bottom: Point; aiming: boolean }>();
  const [submenu, setSubmenu] = createSignal<HTMLDivElement>();
  const items = new Map<string, HTMLButtonElement>();
  let previous: Point | undefined;
  let stall: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(stall));

  makeEventListener(window, 'pointermove', (event) => {
    const pointer = { x: event.clientX, y: event.clientY };
    const from = previous;
    previous = pointer;
    track(pointer, from);
  });

  return (
    <div class={styles.page}>
      <header class={styles.header}>
        <h1>Safe triangle menu</h1>
        <label>
          <input
            type="checkbox"
            checked={showTriangle()}
            onChange={(event) => setShowTriangle(event.currentTarget.checked)}
          />
          Show the triangle
        </label>
      </header>
      <div class={styles.stage}>
        <button class={styles.filter} onClick={() => setOpen(!open())}>
          <span class={styles.filterIcon} aria-hidden="true" />
          Filter
        </button>
        <Show when={open()}>
          <div class={styles.menus}>
            <div class={styles.menu} role="menu">
              <input class={styles.search} placeholder="Search all..." />
              <For each={groups}>
                {(group) => (
                  <button
                    ref={(element) => items.set(group.id, element)}
                    class={[styles.item, { [styles.highlighted!]: active() === group.id }]}
                    role="menuitem"
                    aria-haspopup="menu"
                    aria-expanded={active() === group.id ? 'true' : 'false'}
                    onFocus={() => setActive(group.id)}
                  >
                    <span class={styles.icon} aria-hidden="true">
                      {group.icon}
                    </span>
                    {group.label}
                    <span class={styles.chevron} aria-hidden="true">
                      ▸
                    </span>
                  </button>
                )}
              </For>
            </div>
            <Show when={groups.find((group) => group.id === active())}>
              {(group) => (
                <div
                  ref={setSubmenu}
                  class={styles.menu}
                  role="menu"
                  style={{ 'margin-top': `${submenuOffset(group().id)}px` }}
                >
                  <input class={styles.search} placeholder={`${group().label}...`} />
                  <For each={group().options}>
                    {(option) => (
                      <button class={[styles.item, styles.option]} role="menuitem">
                        <span class={styles.icon} aria-hidden="true">
                          {option.icon}
                        </span>
                        {option.label}
                      </button>
                    )}
                  </For>
                </div>
              )}
            </Show>
          </div>
        </Show>
        <Show when={showTriangle() && triangle()}>
          {(shape) => {
            const color = () => (shape().aiming ? '#22a06b' : '#2f80ed');
            const corners = () => [shape().apex, shape().top, shape().bottom];
            return (
              <svg class={styles.triangle} aria-hidden="true">
                <polygon
                  points={corners()
                    .map((p) => `${p.x},${p.y}`)
                    .join(' ')}
                  fill={color()}
                  fill-opacity="0.16"
                  stroke={color()}
                  stroke-dasharray="5 4"
                />
                <For each={corners()}>{(p) => <circle cx={p.x} cy={p.y} r="3" fill={color()} />}</For>
              </svg>
            );
          }}
        </Show>
      </div>
      <p class={styles.note}>
        Move from an item toward its submenu: inside the triangle the submenu stays and the items you cross do not take
        over. Leave the triangle, or rest in it, and the item under the pointer does.
      </p>
    </div>
  );

  /** One pointer move: keeps the aim while it stays in the triangle, otherwise lets the hovered item take over. */
  function track(pointer: Point, from: Point | undefined) {
    const panel = submenu();
    const edge = panel?.getBoundingClientRect();
    const current = triangle();
    if (edge && contains(edge, pointer)) {
      // Arrived: the submenu has the pointer.
      clearTimeout(stall);
      setTriangle(undefined);
      return;
    }

    const base = edge && { top: { x: edge.left, y: edge.top }, bottom: { x: edge.left, y: edge.bottom } };
    if (current?.aiming && base) {
      if (inTriangle(pointer, current.apex, base.top, base.bottom)) {
        restartStall(pointer);
        return;
      }

      clearTimeout(stall);
    }

    const hovered = itemAt(pointer);
    if (base && from && hovered !== active() && inTriangle(pointer, from, base.top, base.bottom) && active()) {
      // A move from the open item's row toward its submenu: aiming.
      setTriangle({ apex: from, ...base, aiming: true });
      restartStall(pointer);
      return;
    }

    if (hovered) {
      setActive(hovered);
    }

    const opened = submenu()?.getBoundingClientRect();
    setTriangle(
      opened && hovered
        ? {
            apex: pointer,
            top: { x: opened.left, y: opened.top },
            bottom: { x: opened.left, y: opened.bottom },
            aiming: false
          }
        : undefined
    );
  }

  /** After resting in the triangle for {@link stallMs}, the aim lapses and the hovered item takes over. */
  function restartStall(pointer: Point) {
    clearTimeout(stall);
    stall = setTimeout(() => {
      setTriangle(undefined);
      const hovered = itemAt(pointer);
      if (hovered) {
        setActive(hovered);
      }
    }, stallMs);
  }

  function itemAt(pointer: Point) {
    for (const [id, element] of items) {
      if (contains(element.getBoundingClientRect(), pointer)) {
        return id;
      }
    }

    return undefined;
  }
}

type Point = { x: number; y: number };

/** Milliseconds of rest inside the triangle after which the aim lapses. */
const stallMs = 400;

const groups = [
  {
    id: 'status',
    label: 'Status',
    icon: '◌',
    options: [
      { label: 'Icebox', icon: '◌' },
      { label: 'Backlog', icon: '◌' },
      { label: 'Todo', icon: '○' },
      { label: 'In Progress', icon: '◐' },
      { label: 'Done', icon: '●' }
    ]
  },
  {
    id: 'assignee',
    label: 'Assignee',
    icon: '◍',
    options: [
      { label: 'Unassigned', icon: '○' },
      { label: 'Ann Lee', icon: '●' },
      { label: 'Bo Chen', icon: '●' },
      { label: 'Cy Diaz', icon: '●' }
    ]
  },
  {
    id: 'priority',
    label: 'Priority',
    icon: '▮',
    options: [
      { label: 'Urgent', icon: '!' },
      { label: 'High', icon: '▮' },
      { label: 'Medium', icon: '▮' },
      { label: 'Low', icon: '▮' },
      { label: 'No priority', icon: '–' }
    ]
  },
  {
    id: 'labels',
    label: 'Labels',
    icon: '⬭',
    options: [
      { label: 'Bug', icon: '●' },
      { label: 'Feature', icon: '●' },
      { label: 'Improvement', icon: '●' },
      { label: 'Docs', icon: '●' }
    ]
  },
  {
    id: 'project',
    label: 'Project properties',
    icon: '⬡',
    options: [
      { label: 'Lead', icon: '○' },
      { label: 'Members', icon: '○' },
      { label: 'Start date', icon: '○' },
      { label: 'Target date', icon: '○' }
    ]
  }
];

/** The submenu's offset from the menu's top: one row per item above the one that opened it, as in the demo. */
function submenuOffset(id: string) {
  return groups.findIndex((group) => group.id === id) * rowHeight;
}

/** Height of a menu row in CSS pixels, as the stylesheet sets it. */
const rowHeight = 30;

function contains(box: DOMRect, point: Point) {
  return point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom;
}

/** Whether `p` lies inside the triangle `a`, `b`, `c` (either winding). */
function inTriangle(p: Point, a: Point, b: Point, c: Point) {
  const cross = (o: Point, u: Point, v: Point) => (u.x - o.x) * (v.y - o.y) - (u.y - o.y) * (v.x - o.x);
  const d1 = cross(a, b, p),
    d2 = cross(b, c, p),
    d3 = cross(c, a, p);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}
