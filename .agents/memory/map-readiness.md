---
name: Map readiness and cached loaders
description: React batching can conceal ready transitions when rebuilding an imperative map from a cached library.
---

Treat an imperative map's identity as separate from its loading status.

**Why:** With an already-resolved library promise, React can batch loading and ready updates into a single render whose final status is still ready. Effects depending only on that status can miss the replacement map, leaving tiles visible without overlays after retry.

**How to apply:** When rebuilding maps or similar imperative widgets, explicitly signal the newly constructed instance to dependent effects. Regression checks must exercise both fresh library loading and cached-library retries with real rendering.