---
name: Rendered fixture isolation
description: Keep browser tests isolated when a shared component needs different fake store contracts in different suites.
---

Use separate Vite test fixtures when the same rendered component must resolve its store imports to different fake contracts in different suites.

**Why:** Replacing a shared component's imports globally can silently change behavior for existing component tests, even when the new fixture is intended to test a parent component.

**How to apply:** Give each fixture its own server/config and fake modules, and block external requests in the rendered test so no live backend writes can occur.