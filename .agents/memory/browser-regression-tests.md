---
name: Browser regression test setup
description: Restoring the declared Playwright runner in this workspace before browser regression tests.
---

Playwright can be declared and locked for an artifact while its executable is still absent from that artifact's `node_modules/.bin`. An offline install may also fail when the pnpm store lacks the package tarball.

**Why:** The workspace's browser binaries may exist independently from the Node package store, so having Chromium installed does not guarantee the Playwright runner is available.

**How to apply:** Check the artifact-local executable before diagnosing the test suite. If it's missing, use a frozen-lockfile, artifact-scoped pnpm install; retry online if the offline store lacks the existing locked package.