---
name: Attraction navigation labels
description: Preserve named attractions in Apple Maps and Google Maps handoffs instead of displaying nearby businesses.
---

For Wander Glasgow's “Open in navigation” handoff, pass attraction names for stops and named origins without appending postcodes or addresses. Keep a coordinate only for a genuinely unnamed route origin, such as a user-selected GPS start, and preserve stop order.

**Why:** The user found that coordinate-based map links were being labeled as unrelated nearby businesses and wants the attraction name shown instead.

**How to apply:** When changing route URL generation, use names for all attraction destinations and waypoints in Apple Maps and Google Maps; retain coordinates only where no attraction name exists. Test that links include names and omit attraction coordinates.
