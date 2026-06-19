---
name: ProductUnit type import source
description: ProductUnit type lives in ./db, not ./product-units; product-units.ts does not re-export it.
---

**Rule:** Always `import type { ProductUnit } from "./db"` (or from `@/lib/db` in components). Do NOT import it from `"./product-units"` — that module imports it for internal use but does not re-export it (causing TS2459).

**Why:** The ProductUnit interface is defined in db.ts (Dexie schema). product-units.ts exposes helper functions and schemas but is not a type barrel.

**How to apply:** Any file needing the ProductUnit type should import from ./db directly.
