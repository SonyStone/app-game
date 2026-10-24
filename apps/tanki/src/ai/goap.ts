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
 */
export function plan<Name extends string>(
  state: Facts,
  goal: Facts,
  actions: readonly GoapAction<Name>[],
  maxSteps = 6
): GoapAction<Name>[] | undefined {
  type Node = { facts: Facts; cost: number; estimate: number; steps: GoapAction<Name>[] };
  const open: Node[] = [{ facts: state, cost: 0, estimate: unmet(state, goal), steps: [] }];
  const best = new Map<string, number>([[key(state), 0]]);
  let expansions = 0;

  while (open.length > 0 && expansions < MAX_EXPANSIONS) {
    open.sort((a, b) => a.cost + a.estimate - (b.cost + b.estimate));
    const node = open.shift()!;
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
      open.push({ facts, cost, estimate: unmet(facts, goal), steps: [...node.steps, action] });
    }
  }

  return undefined;
}

/**
 * Picks the goal to pursue: the highest-priority goal that does not hold yet and has a plan.
 * Returns the goal with its plan, or `undefined` when every goal holds or none can be reached.
 */
export function chooseGoal<Name extends string, Action extends string>(
  state: Facts,
  goals: readonly GoapGoal<Name>[],
  actions: readonly GoapAction<Action>[]
) {
  const ranked = [...goals].sort((a, b) => b.priority - a.priority);

  for (const goal of ranked) {
    if (holds(state, goal.wants)) {
      continue;
    }

    const steps = plan(state, goal.wants, actions);

    if (steps) {
      return { goal, steps };
    }
  }

  return undefined;
}

/** Whether every fact in `wanted` has the same value in `facts`, missing ones counting as false. */
export function holds(facts: Facts, wanted: Facts) {
  return Object.entries(wanted).every(([name, value]) => (facts[name] ?? false) === value);
}

/** Search budget per plan, so a hopeless goal cannot stall a frame. */
const MAX_EXPANSIONS = 512;

function unmet(facts: Facts, goal: Facts) {
  return Object.entries(goal).filter(([name, value]) => (facts[name] ?? false) !== value).length;
}

function key(facts: Facts) {
  return Object.keys(facts)
    .filter((name) => facts[name])
    .sort()
    .join('|');
}
