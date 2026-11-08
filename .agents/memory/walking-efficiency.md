---
name: Walking efficiency priorities
description: User-selected stop-count priority and limits on claims about shortest walking routes.
---

For planned walks, keep the stop target and minimise walking; do not quietly skip additional feasible sights just to make the walk shorter.

**Why:** The user explicitly selected “Keep the stop target, minimise walking” over allowing fewer stops to avoid detours.

**How to apply:** Preserve the maximum feasible count up to the visitor's chosen target, then minimise distance. Explain genuinely unavoidable retracing rather than promising that no street can ever be repeated.

The independent OSRM provider's table distances describe its fastest/profile-preferred paths, not necessarily physically shortest street paths.

**Why:** The provider's API documents this distinction; an exact stop-order optimiser does not change the provider's underlying path objective.

**How to apply:** Qualify efficiency claims as shortest stop ordering under supplied walking distances. Do not claim a global street-level shortest-path or zero-backtracking guarantee without changing and verifying the routing source.

For a visitor-selected 6+ target, include as many matching, reachable attractions as fit within the configured total walking budget, then minimise supplied route distance for that count. The option has no user-selected stop-count cap.

**Why:** The user requested a 6+ option without an upper stop-count bound while avoiding unreasonable routes.

**How to apply:** Preserve exact search and existing candidate/computation limits. If the route cannot be proved within those limits, show a clear error instead of a guessed or greedy route. Warn when a walk exceeds seven stops because displayed duration excludes time spent at attractions.