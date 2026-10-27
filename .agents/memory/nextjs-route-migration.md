---
name: Next.js route migration
description: Avoid App Router build conflicts from leftover Pages Router directories.
---

When a Next.js project uses the App Router, a leftover `pages/` or `src/pages/` directory can make `next build` fail, even if it contains only an unused scaffold 404 component or is empty.

**Why:** A Vercel production build failed after workspace restoration because an unused scaffold Pages Router directory remained beside the App Router.

**How to apply:** Before building an App Router project after importing or migrating it, search for both `pages/` and `src/pages/`; remove obsolete scaffold files and empty directories if the app does not intentionally use the Pages Router.
