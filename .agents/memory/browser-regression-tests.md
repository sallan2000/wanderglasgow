---
name: Browser regression test setup
description: Restoring the declared Playwright runner in this workspace before browser regression tests.
---

Playwright can be declared and locked for an artifact while its executable is still absent from that artifact's `node_modules/.bin`. An offline install may also fail when the pnpm store lacks the package tarball.

**Why:** The workspace's browser binaries may exist independently from the Node package store, so having Chromium installed does not guarantee the Playwright runner is available.

**How to apply:** Check the artifact-local executable before diagnosing the test suite. If it's missing, use a frozen-lockfile, artifact-scoped pnpm install; retry online if the offline store lacks the existing locked package.

Browser fixtures that deliberately hold an external resource should navigate with `waitUntil: 'domcontentloaded'`, then wait for the component's expected loading state. Waiting for the full `load` event can hang while the intercepted request is held.

**Why:** A lifecycle test that pauses the map library request may also delay Playwright's full page-load completion.

**How to apply:** Use DOM readiness for map-fixture navigation when the test controls whether a script request is released.

Keyboard focus does not wrap from the last tabbable control to the first one when Tab is pressed; browsers may move focus out of the page.

**Why:** Assuming wraparound made a keyboard retry test assert an impossible tab sequence after submitting from the final form control.

**How to apply:** After an async submission, assert where focus actually remains and use that focused control for keyboard retries, rather than assuming Tab cycles back to the first link.