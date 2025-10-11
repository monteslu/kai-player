# Tailwind CSS v4 Migration Notes

**Date:** 2025-10-11  
**Status:** POSTPONED - Requires Major Rewrite

---

## What Happened

Attempted to update Tailwind CSS from v3.4.18 to v4.1.14 during Phase 1 dependency updates.

## Breaking Changes Discovered

### 1. PostCSS Plugin Separation
- Tailwind v4 moved PostCSS plugin to separate `@tailwindcss/postcss` package
- **Fixed:** Installed package and updated `postcss.config.js`

### 2. Color System Completely Changed
- **Error:** `Cannot apply unknown utility class 'border-gray-200'`
- Tailwind v4 uses CSS-first configuration instead of JavaScript config
- Default color palette is no longer automatically included
- Requires migration to CSS variables and `@theme` directives

### 3. Configuration System Rewrite
- `tailwind.config.js` being deprecated in favor of CSS-based config
- `@apply` directives work differently
- Requires `@reference` directive for CSS modules

## Migration Complexity

**Estimated Effort:** 8-12 hours

**Required Changes:**
1. Rewrite all `@apply` statements in CSS files
2. Convert `tailwind.config.js` to CSS-based configuration
3. Update color references throughout codebase
4. Test all 115 component files for visual regressions
5. Update build pipeline

**Files Affected:**
- `src/renderer/styles/tailwind.css` (40 lines with @apply)
- `src/web/styles/tailwind.css`
- `tailwind.config.js` (convert to CSS)
- All 39 shared components using Tailwind classes

## Decision

**Rolled back to Tailwind v3.4.18** for the following reasons:
1. Phase 1 focus is on dependency updates, not major rewrites
2. No tests exist yet to verify UI changes
3. V3 → V4 migration requires dedicated focus
4. V3.4.18 is stable and secure (0 vulnerabilities)

## Recommendation

**Add as Separate Phase (Phase 9 or later):**
- Dedicated Tailwind v4 migration sprint
- After test coverage is established (Phase 2)
- Can leverage visual regression tests
- Estimate 2-3 days of work

## Resources

- Tailwind v4 Migration Guide: https://tailwindcss.com/docs/upgrade-guide
- CSS-First Configuration: https://tailwindcss.com/docs/configuration
- Breaking Changes: https://tailwindcss.com/docs/upgrade-guide#breaking-changes

---

**Current Status:**  
✅ Express upgraded to v5.1.0  
⏸️ Tailwind remains at v3.4.18 (intentionally)
