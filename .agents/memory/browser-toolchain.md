---
name: Browser toolchain compatibility
description: Why production-build success alone does not verify Vite development compatibility.
---

When changing Vite or the workspace-wide esbuild version, check development dependency prebundling as well as the production build. Their compilation targets are independent.

**Why:** An older Vite default browser target can require transforms that a newer esbuild does not support. Setting the production target can make the build succeed while development dependency prebundling still fails.

**How to apply:** Keep supported-browser targets consistent across both stages and confirm the managed development server starts after toolchain changes. Do not assume a production build validates development startup.