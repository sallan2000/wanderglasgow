---
name: Leaflet initial view
description: A Leaflet mixed-vector initialization ordering constraint discovered in mobile route maps.
---

Initialise the Leaflet map view before adding mixed polyline and circle-marker overlays.

**Why:** Leaflet 1.9.4 can leave shared vector renderer bounds undefined when layers are created before the first view. A later fitBounds can then fail inside Bounds.intersects/Polyline._clipPoints, even though the library, map tiles and route geometry loaded successfully.

**How to apply:** Set a valid initial view or bounds before adding vector layers. If a map catch reports a failure, distinguish library/network failures from construction failures rather than assuming the provider is down.

After a map is constructed but initialization fails, `map.remove()` can leave the canvas marked with Leaflet's `leaflet-container` class even though the map is no longer live.

**Why:** The class is added during Leaflet container setup and is not a reliable indicator that initialization completed or that a usable map remains.

**How to apply:** For failed-map assertions, check the tracked live map, controls, and overlays rather than treating the container class alone as proof of a working preview.