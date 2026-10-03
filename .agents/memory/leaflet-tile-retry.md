---
name: Leaflet background tile retry
description: Distinguishes retrying a tile layer from recreating its Leaflet map.
---

Background tile retries redraw the existing layer; they do not recreate the map.

**Why:** Rebuilding a map for a transient tile error would discard vector overlays and resize observation unnecessarily. Lifecycle checks should match whether the product is retrying tiles or reconstructing the map.

**How to apply:** For tile retries, verify the existing map and overlays remain and test tile-layer error events separately. Assert map teardown only for unmount or map-construction retries.

## Browser test timing

The browser regression that waits to click the tile retry control can time out because the warning is detached before Playwright completes the click. Treat that as a tile-event/state-transition failure to investigate, not as evidence that the map was recreated.

**Why:** Repeated Chromium runs with intercepted tile requests reproduced the detached retry control before its click handler ran.

**How to apply:** When validating background-only retries, let the initial tile load finish before injecting a controlled tile error. Pending Leaflet load events can clear the warning between an assertion and a Playwright stability check, so activate the visible retry control as soon as it mounts. Assert the warning's state transitions and map/overlay lifecycle separately.