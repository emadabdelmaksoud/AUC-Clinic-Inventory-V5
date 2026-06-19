---
name: Store Control query key fix
description: Products and warehouses must use stable query keys (no search term in key) and filter client-side.
---

Query keys like `["products", search]` cause cache misses after mutations because `invalidateQueries({ queryKey: ["products"] })` uses prefix matching — but if the active query has key `["products", ""]`, React Query v5 does match it. However the real issue was stale data: the mutation invalidated correctly but if any stale cache entry with a different key existed, the list didn't refresh.

**Rule:** Use `queryKey: ["products"]` and `queryKey: ["warehouses"]` (no search term). Filter locally with `useMemo`.

**Why:** Stable keys mean a single cache entry per entity type — invalidation always hits the right entry. Client-side filtering with useMemo is fast enough for clinic-scale datasets (< 10 k records).

**How to apply:** Any `useQuery` that previously included a search/filter param in the key should be converted to the stable-key + useMemo pattern. Mutations should still `invalidateQueries` on the stable key.
