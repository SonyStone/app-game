## Coding Style & Conventions

### SolidJS skills

When implementing features, fixing bugs, or refactoring SolidJS code, read these skills from the repository root:

- `.agents/skills/solid-primitives/SKILL.md` to reuse Solid Primitives before writing custom reactive infrastructure.
- `.agents/skills/solid-jsx-architecture/SKILL.md` for component, factory, context, and resource-lifetime boundaries.
- `.agents/skills/solid2/SKILL.md` for Solid 2 API semantics; open only the bundled pages the task needs.

### Simplification preference

When simplifying existing code, establish required behavior from actual callers and explicit public contracts. A queue, forwarding layer, or separate factory needs a consumer requirement to justify keeping it. Remove unused machinery within the requested scope, but preserve externally promised behavior even when local callers do not exercise it. Explain retained complexity in terms of those requirements.

### Newspaper code structure preference

Organize code so it reads top-down like a newspaper article. Put the public API, primary entry point, and important control flow first; place progressively lower-level helpers, implementation details, and constants later. Order helpers by first conceptual use so a reader can stop once they have enough detail.

### Control-flow layout preference

Separate logical blocks with blank lines. Write `if` bodies as multiline braced blocks, not single-line or brace-less statements.

### Types near use preference

Keep TypeScript types as close as practical to the declarations and values they describe. Avoid collecting unrelated internal types at the top or bottom of a file.

When a type already exists implicitly in a function or value, prefer deriving it with utilities such as `Parameters<>` and `ReturnType<>` instead of manually duplicating its shape. Use an explicit named type when derivation would be circular, obscure, or harder to understand.

### Declaration-site exports preference

Do not collect local declarations into grouped `export { ... }` or `export type { ... }` blocks merely to expose a module API.

Export each locally defined function, type, class, or constant at its declaration using forms such as `export function`, `export type`, or `export const`.

### JSDoc preference

Add concise JSDoc to functions, components, types, and public properties. Document purpose, behavior, defaults, constraints, callback contracts, side effects, thrown errors, and other information a caller needs but the type signature alone does not convey.

Keep JSDoc beside the declaration it describes and update it when behavior changes. Avoid comments that merely restate a name or narrate obvious implementation details; document non-exported code only when its contract or reasoning is non-obvious.
