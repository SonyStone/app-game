## Coding Style & Conventions

### Newspaper code structure preference

Organize code so it reads top-down like a newspaper article. Put the public API, primary entry point, and important control flow first; place progressively lower-level helpers, implementation details, and constants later. Order helpers by first conceptual use so a reader can stop once they have enough detail.

### Types near use preference

Keep TypeScript types as close as practical to the declarations and values they describe. Avoid collecting unrelated internal types at the top or bottom of a file.

When a type already exists implicitly in a function or value, prefer deriving it with utilities such as `Parameters<>` and `ReturnType<>` instead of manually duplicating its shape. Use an explicit named type when derivation would be circular, obscure, or harder to understand.

### Declaration-site exports preference

Do not collect local declarations into grouped `export { ... }` or `export type { ... }` blocks merely to expose a module API.

Export each locally defined function, type, class, or constant at its declaration using forms such as `export function`, `export type`, or `export const`.

### JSDoc preference

Add concise JSDoc to functions, components, types, and public properties. Document purpose, behavior, defaults, constraints, callback contracts, side effects, thrown errors, and other information a caller needs but the type signature alone does not convey.

Keep JSDoc beside the declaration it describes and update it when behavior changes. Avoid comments that merely restate a name or narrate obvious implementation details; document non-exported code only when its contract or reasoning is non-obvious.
