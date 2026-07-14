# Solid SVG Editor Extensions

Extensions are packaged app contributions. Install packages at the composition root:

```ts
import { sampleExtensionPackage } from './extensions/sampleExtensionContribution';
import { createEditorAppController } from './features/shell/createEditorAppController';

const controller = createEditorAppController({
  packages: [sampleExtensionPackage]
});
```

Raw `contributions` are still accepted for local tests and migration work, but package exports should
be the default boundary for external features because they carry manifest metadata next to their
contribution payload.

The live registry also exposes `kernel.registries.contributionSources`, which records whether each
installed contribution came from core editor code, a raw external install, a package, or a direct
registry call. Package-backed entries include the owning package ID so diagnostics, Debug views, and
future migration tooling can explain where each action, command, tool, panel, capability, or renderer
entered the app. Shared registry diagnostics consume this source map when available, so duplicate
contributions, duplicate registry items, missing references, and invalid registry items can point back
to their core, raw, direct, or package-backed owner.

Package manifests are included in the live registry inventory, and duplicate, malformed, or
incompatible manifests surface through registry diagnostics. Installed package metadata and
diagnostics appear in the Extensions settings section.

Set each manifest's `editorApiVersion` to `currentEditorExtensionApiVersion` from
`src/editor/extension-packages`. The registry exposes `kernel.registries.packageCompatibility` for
each installed package. Packages targeting the current API are compatible, packages targeting a newer
API are incompatible until the editor host upgrades, and packages targeting an older API need a
declared migration path before the host should enable them.

Manifests can declare migration steps between editor extension API versions:

```ts
migrations: [
  {
    id: 'vendor.toolkit-api-0-to-1',
    fromEditorApiVersion: 0,
    toEditorApiVersion: 1,
    description: 'Update command contribution durability metadata.'
  }
]
```

Declared migrations are metadata for package-host workflows. The default shell reports the migration
path in Settings and Debug and keeps stale packages blocked until the host marks the required
migration keys applied. Settings exposes a package action for that persisted launch policy, and the
next kernel startup treats the package as migrated when every required key is present. This is the
host-side migration acceptance path; actual package code/data transforms and live reload still need
dedicated runtime work.

Manifests can declare `dependencies` with package IDs and optional exact versions:

```ts
dependencies: [{ id: 'vendor.base-tools', version: '1.0.0' }]
```

The registry reports missing dependencies and exact-version mismatches as package diagnostics. The
Settings and Debug extension inventories also show dependency summaries next to package API version
and contribution IDs. Active package contributions are flattened after their active dependencies, so
hosts can install packages in any order without making dependent packages race their foundations.
Dependency cycles are reported as package diagnostics and keep the cycle participants, plus packages
depending on them, out of the live contribution registries.

Package hosts can read `kernel.registries.packageStates` to show activation status,
`kernel.registries.packageLoadOrder` to show the dependency-resolved order for active packages, and
`kernel.registries.packageDependencyGraph` to show both declared dependencies and installed packages
that depend on each package. They can also read `kernel.registries.packageCompatibility` to show API
compatibility and migration path status without parsing diagnostics. A package is `active` when it
has no package-level diagnostics,
`disabled` when the host deliberately withholds it or one of its dependencies, and `blocked` when
manifest, API, duplicate-ID, or dependency diagnostics must be resolved before the package should be
treated as safely enabled. Pass `disabledPackageIds` to the shell install options to keep a package in
inventory while withholding its contributions. The shell installs contributions from active packages
only; disabled and blocked packages remain in inventory so authors can inspect host policy, manifests,
dependencies, dependent packages, load order, and diagnostics without their actions, tools,
capabilities, or UI surfaces entering the live editor registries.

Package enablement also has a persisted settings surface. Hosts can read
`kernel.settings.disabledExtensionPackageIds()` and call
`kernel.settings.setExtensionPackageEnabled(packageId, enabled)` from package-management UI. The
default shell merges that persisted policy with explicit `disabledPackageIds` when the app kernel is
created. Current package enablement is a startup policy; live package unload/reload still needs a
larger runtime lifecycle because viewport tools, renderers, capabilities, and shortcuts snapshot some
installed contributions during service creation.

Migration acceptance uses the same settings service. Hosts can read
`kernel.settings.appliedExtensionPackageMigrationKeys()` and call
`kernel.settings.setExtensionPackageMigrationsApplied(packageId, migrationIds, applied)` after running
or accepting a package migration path. The shell merges those persisted keys with explicit
`appliedMigrationKeys` at startup before resolving package compatibility, activation, and load order.

Package update discovery is also host-provided. Pass `availablePackageUpdates` when a marketplace,
package manager, or local loader knows about newer package versions but only has metadata:

```ts
availablePackageUpdates: [
  {
    packageId: 'vendor.base-tools',
    version: '1.1.0',
    editorApiVersion: currentEditorExtensionApiVersion,
    notes: 'Adds cleaner transform commands.'
  }
]
```

When the host already has the updated package payload, pass `packageUpdates` instead:

```ts
packageUpdates: [
  {
    package: vendorBaseToolsV11Package,
    notes: 'Adds cleaner transform commands.'
  }
]
```

The registry exposes matching candidates through `kernel.registries.packageUpdates` and reports
update diagnostics without blocking the currently installed package. Settings and Debug show whether
an update is ready for the current API, needs migration metadata, or targets an incompatible API.
Settings can mark a ready update as applied for the next launch via
`kernel.settings.setExtensionPackageUpdateApplied(packageId, version, applied)`. At startup, the shell
merges persisted update keys with explicit `appliedUpdateKeys` and replaces the installed package
with the matching `packageUpdates` payload before building registries, capabilities, renderers, and
shortcuts. Downloading packages and hot-reloading an already-running kernel remain future
package-manager work.

Package hosts can also read `kernel.registries.health` for a compact registry summary: overall status,
package counts by activation state, contribution count, and diagnostic counts by severity. Use that
summary for Settings, Debug, and future enablement controls instead of re-counting raw issues in each
surface.

`sampleExtensionContribution.tsx` is the reference package shape for external features. It includes:

- an SVG capability with custom elements, attributes, defaults, bounds, diagnostics, inspector control, and a custom resource kind
- an operation-backed command plus app-menu, context-menu, command-palette, and shortcut entry points
- a modal action and modal contribution
- a viewport tool, renderer adapter, viewport overlay, settings section, and panel

Prefer contribution-owned contracts over shell edits. A new feature should register the smallest set of
actions, commands, UI surfaces, SVG capabilities, renderers, and diagnostics it needs.

Prefer operation-backed commands for document mutations. Use a legacy command contribution only when a
mutation cannot yet be expressed as serializable editor operations, and include a durability reason so
history and extension diagnostics can identify the compatibility path.
