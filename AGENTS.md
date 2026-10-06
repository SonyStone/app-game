## Parallel Agents & Worktrees

Several agent sessions work in this repository at once. Each session works in its own git worktree on its own branch, never in a checkout another session uses.

- T3 Code creates the worktree for a new thread (`t3.json` sets this default and runs the setup). Elsewhere, create one with `git worktree add ../app-game-<task> -b <branch>` and run `pnpm worktree:setup` in it.
- `pnpm worktree:setup` installs dependencies from the shared pnpm store, symlinks local data such as `apps/paint/recordings` to the main checkout, and copies gitignored build outputs. Rerun it after the lockfile changes.
- In the main checkout, do not switch branches, stash, reset, or stage files: other sessions may have uncommitted work there.
- Commit only your own changes. Before merging, rebase on `master`; resolve `pnpm-lock.yaml` conflicts by running `pnpm install`, not by hand.
- Dev servers from other worktrees may hold an app's usual port, and Vite then picks the next free one: read the URL from Vite's output. Stop only processes you started.
- Data linked from the main checkout is shared by every worktree: add to it, but do not delete or rewrite other sessions' files.
- Use the one worktree your session started in. Do not create more (subagents with worktree isolation, scratch checkouts for verification) unless the task cannot be done otherwise; remove any you create with `git worktree remove` before finishing.
- Build Rust only when you change Rust: the WASM modules are committed. In worktrees, Cargo keeps intermediates in the main checkout's `apps/gpu-text-rendering/rust/document-format/target` (`.cargo/config.toml` from the setup), so a build recompiles only the crate itself. Use `cargo +1.92.0`, as the package scripts do: older Cargo ignores the shared directory and rebuilds everything in the worktree. Do not delete the main checkout's `target`.

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
