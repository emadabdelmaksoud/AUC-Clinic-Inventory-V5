---
name: Dexie orderBy requires indexed fields
description: Dexie's orderBy() only works on fields declared in the schema index string — using it on non-indexed fields throws silently (TanStack Query swallows the error and returns the default []).
---

**Rule:** Never call `db.<table>.orderBy("field")` unless that field appears in the Dexie schema index string. When you need to sort by a non-indexed field (e.g. `createdAt`), fetch with `.toArray()` first, then sort in JS.

**Why:** This was the root cause of products and warehouses always showing an empty list. `db.products.orderBy("createdAt")` threw a Dexie `InvalidArgumentError` because `createdAt` was not in `"id, productCode, productName, barcode, category, manufacturer"`. TanStack Query caught the exception, kept `data` at the default `[]`, so the user always saw an empty list even after successfully adding items.

**How to apply:**
- Check the Dexie schema in `db.ts` before using `orderBy`.
- Currently indexed by `createdAt` only for `inventoryTransactions` (and `auditLogs`).
- For `products`, `warehouses`, `productUnits`, `inventoryBatches`: use `.toArray()` then `.sort((a,b) => b.createdAt.localeCompare(a.createdAt))`.
- To add a new index: bump the schema version number and add the field. Existing data is preserved.
