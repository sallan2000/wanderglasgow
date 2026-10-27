---
name: Attraction navigation labels
description: Preserve named attractions in Apple Maps and Google Maps handoffs instead of displaying nearby businesses.
---

For Wander Glasgow's “Open in navigation” handoff, use only Google's cross-platform Maps directions URL. Pass attraction names for stops and named origins without appending postcodes or addresses. Keep a coordinate only for a genuinely unnamed route origin, such as a user-selected GPS start, and preserve stop order.

**Why:** The user found that coordinate-based map links were being labeled as unrelated nearby businesses, then explicitly requested Google Maps only and support for desktop and mobile.

**How to apply:** Use a normal HTTPS anchor to Google's universal directions URL; it opens the Maps app when installed and the browser otherwise. Google Maps mobile browsers support up to three waypoints, while other platforms support up to nine. Do not silently truncate long routes; provide a segmented fallback if full mobile-browser coverage is required. Test both desktop and mobile link behavior, names, and stop order.
