/**
 * Goal-Oriented Action Planning: an agent describes the world as named true/false facts, knows
 * actions that need some facts and change others, and wants goals that are sets of facts. The
 * planner searches for the cheapest chain of actions that turns the current facts into a goal.
 * Missing facts count as false. Plans are short, so the search is a plain A* over fact sets.
 */

/** Facts about the world as an agent sees them; missing names are false. */
export type Facts = Readonly<Record<string, boolean>>;

/** Something an agent can do, in planning terms. */
export type GoapAction<Name extends string = string> = {
  name: Name;
  /** Facts that must hold before the action can start. */
  requires: Facts;
  /** Facts the action makes true or false when it succeeds. */
  effects: Facts;
  /** Price of the action; agents set it from their situation, such as the distance to travel. */
  cost: number;
};

/** A state of the world an agent wants, and how much it wants it. */
export type GoapGoal<Name extends string = string> = {
  name: Name;
  wants: Facts;
  /** Higher priorities are pursued first. */
  priority: number;
};

/**
 * Finds the cheapest sequence of `actions` that makes every fact in `goal` hold, starting from
 * `state`. Returns an empty plan when the goal already holds and `undefined` when no plan of at
 * most `maxSteps` actions exists.
 *
 * The search estimates the rest of the way as the cost of the cheapest action while any wanted
 * fact is missing, which never overestimates, so the plan found is the cheapest even when one
 * cheap action settles several facts.
 */
export function plan<Name extends string>(
  state: Facts,
  goal: Facts,
  actions: readonly GoapAction<Name>[],
  maxSteps = 6
): GoapAction<Name>[] | undefined {
  type Node = { facts: Facts; cost: number; priority: number; steps: GoapAction<Name>[] };
  const cheapest = actions.reduce((lowest, action) => Math.min(lowest, action.cost), Infinity);
  const estimate = (facts: Facts) => (unmet(facts, goal) > 0 ? cheapest : 0);
  const open: Node[] = [];
  const best = new Map<string, number>([[key(state), 0]]);
  let expansions = 0;

  push({ facts: state, cost: 0, priority: estimate(state), steps: [] });

  while (open.length > 0 && expansions < MAX_EXPANSIONS) {
    const node = pop();

    if ((best.get(key(node.facts)) ?? Infinity) < node.cost) {
      continue;
    }

    expansions++;

    if (unmet(node.facts, goal) === 0) {
      return node.steps;
    }

    if (node.steps.length >= maxSteps) {
      continue;
    }

    for (const action of actions) {
      if (!holds(node.facts, action.requires)) {
        continue;
      }

      const facts = { ...node.facts, ...action.effects };
      const cost = node.cost + action.cost;
      const id = key(facts);

      if ((best.get(id) ?? Infinity) <= cost) {
        continue;
      }

      best.set(id, cost);
      push({ facts, cost, priority: cost + estimate(facts), steps: [...node.steps, action] });
    }
  }

  return undefined;

  /** Adds a node to the binary min-heap `open`, ordered by priority. */
  function push(node: Node) {
    let index = open.length;
    open.push(node);

    while (index > 0) {
      const parent = (index - 1) >> 1;

      if (open[parent].priority <= node.priority) {
        break;
      }

      open[index] = open[parent];
      index = parent;
    }

    open[index] = node;
  }

  /** Removes and returns the node of lowest priority. */
  function pop() {
    const top = open[0];
    const last = open.pop()!;

    if (open.length > 0) {
      let index = 0;

      while (true) {
        const left = index * 2 + 1;
        const smaller = left + 1 < open.length && open[left + 1].priority < open[left].priority ? left + 1 : left;

        if (smaller >= open.length || open[smaller].priority >= last.priority) {
          break;
        }

        open[index] = open[smaller];
        index = smaller;
      }

      open[index] = last;
    }

    return top;
  }
}

/**
 * Picks the goal to pursue: the highest-priority goal that does not hold yet and has a plan.
 * Returns the goal with its plan and the plan's total cost, or `undefined` when every goal holds
 * or none can be reached. Actions whose cost is not finite are left out, so an agent can price an
 * action it cannot take at `Infinity`.
 */
export function chooseGoal<Name extends string, Action extends string>(
  state: Facts,
  goals: readonly GoapGoal<Name>[],
  actions: readonly GoapAction<Action>[]
) {
  const ranked = [...goals].sort((a, b) => b.priority - a.priority);
  const usable = actions.filter((action) => Number.isFinite(action.cost));

  for (const goal of ranked) {
    if (holds(state, goal.wants)) {
      continue;
    }

    const steps = plan(state, goal.wants, usable);

    if (steps) {
      return { goal, steps, cost: steps.reduce((total, step) => total + step.cost, 0) };
    }
  }

  return undefined;
}

/** Whether every fact in `wanted` has the same value in `facts`, missing ones counting as false. */
export function holds(facts: Facts, wanted: Facts) {
  return Object.entries(wanted).every(([name, value]) => (facts[name] ?? false) === value);
}

/** Search budget per plan, so a hopeless goal cannot stall a frame. */
const MAX_EXPANSIONS = 2048;

function unmet(facts: Facts, goal: Facts) {
  return Object.entries(goal).filter(([name, value]) => (facts[name] ?? false) !== value).length;
}

function key(facts: Facts) {
  return Object.keys(facts)
    .filter((name) => facts[name])
    .sort()
    .join('|');
}
