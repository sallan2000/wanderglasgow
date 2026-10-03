---
name: Leaflet background tile retry
description: Distinguishes retrying a tile layer from recreating its Leaflet map.
---

Background tile retries redraw the existing layer; they do not recreate the map.

**Why:** Rebuilding a map for a transient tile error would discard vector overlays and resize observation unnecessarily. Lifecycle checks should match whether the product is retrying tiles or reconstructing the map.

**How to apply:** For tile retries, verify the existing map and overlays remain and test tile-layer error events separately. Assert map teardown only for unmount or map-construction retries.