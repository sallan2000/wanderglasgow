---
name: Workspace package installation
description: Handling the package installer when it targets the pnpm workspace root instead of an artifact.
---

Keep application dependencies scoped to their artifact package.

**Why:** The generic package-install callback targets the workspace root and can fail with `ERR_PNPM_ADDING_TO_ROOT`; it does not select the target artifact automatically. Adding a client library to the root to bypass this loses correct package ownership.

**How to apply:** Read the package-management skill first. If its installer hits this workspace-root limitation, use the artifact-filtered pnpm add command, following pnpm-workspace rules. Do not disable the workspace root guard or move application dependencies into the root as a workaround.

A frozen install can also fail with `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` when the lockfile does not match the current workspace override settings.

**Why:** The workspace lockfile may be refreshed independently of its `pnpm-workspace.yaml` overrides; pnpm refuses a frozen install rather than silently reconciling them.

**How to apply:** Compare the lockfile and workspace settings, then run `pnpm install --no-frozen-lockfile` from the workspace root when they need reconciliation. Review the lockfile diff before committing.