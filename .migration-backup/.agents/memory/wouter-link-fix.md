---
name: Wouter v3 Link fix
description: wouter v3 Link renders its own <a> tag — never nest a bare <a> inside Link.
---

**Rule:** wouter v3.x `<Link>` renders an `<a>` element. Wrapping it in another `<a>` creates invalid HTML (`<a><a>`) and causes React hydration warnings.

**Why:** This created React "cannot be a descendant" console errors and invalid DOM structure, which affects accessibility and browser behaviour.

**How to apply:** Pass `className`, `onClick`, `data-testid` etc. directly to `<Link>` — it accepts all anchor props. For wrapping icon buttons (`<Link><Button>`), that creates `<a><button>` which browsers tolerate; it's acceptable if needed for button styling.
