# Version compatibility

These observations were checked against installed `solid-js`, `@solidjs/signals`, and `@solidjs/web` RC.4 on 2026-09-27. They are historical compatibility notes, not a version requirement. Recheck the consuming package after dependency changes.

| API | Installed RC.4 | Newer bundled documentation |
| --- | --- | --- |
| [refresh](core/refresh.md) | Returns `void`. Use [resolve](core/resolve.md) when an imperative caller must await settled data. | Returns a promise for the next settled state. |
| [until](core/until.md) | Not exported. | Waits for a reactive predicate to become truthy. |
| [ssrSource](core/create-memo.md) with `hybrid` | Installed hydration declarations describe server seeding followed by client recomputation. | The newer generated reference continues async iterables; sync/promise computations adopt the server value without that initial recomputation. |

For `Portal`, RC.4 renderer declarations describe an empty server result and client rendering after hydration, while an older bundled cheatsheet says it throws on the server. Check the matching renderer implementation if this behavior matters.
