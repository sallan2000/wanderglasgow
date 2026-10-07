---
name: Offline itinerary scope
description: Keep explicit local itinerary exports distinct from server-resolved emails and whole-site offline support.
---

Offline itinerary copies are explicit local snapshots of the walk the visitor is viewing, not canonical server-generated downloads. They embed a bounded OpenStreetMap vector extract requested from Overpass only when the visitor prints or downloads. Disclose that the approximate map area and normal request data go to OpenStreetMap; do not send the itinerary file or stop stories. Never package `tile.openstreetmap.org` raster tiles for offline use; its tile policy prohibits it. A GPS-derived copy may retain its chosen start and route only with a clear disclosure that sharing the file shares that information.

**Why:** The user chose a genuine embedded street map while keeping the exported file connection-free. OSM's standard raster-tile service does not permit offline packaging, so the export uses OSM vector data and shares only the map bounds at creation. Email content has different semantics: it resolves published records on the server.

**How to apply:** Keep itinerary text and stop details local and embed all map geometry so the saved file opens without network access. Do not reuse an email resolver or send the itinerary to a map service. Treat broader offline navigation, server retention and attachments as separately requested work.