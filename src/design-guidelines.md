# Design Guidelines

Extracted from MatchDetailModal.tsx to ensure UI consistency.

## 1. Border Radius (Rounding)
- **Modal Main Container:** `rounded-2xl sm:rounded-3xl`
- **Internal Cards/Containers:** `rounded-xl sm:rounded-2xl`
- **Buttons (Tabs, Filters, Close):** `rounded-lg sm:rounded-xl`
- **Badges/Tags (League, Status, Stats):** `rounded-md sm:rounded-lg`

## 2. Spacing & Padding
- **Main Container Padding:** `p-3 sm:p-6`
- **Section/Component Padding:** `p-3` or `p-4` (based on component density)
- **Container Section Spacing (space-y):** `space-y-3.5 sm:space-y-5`
- **Internal Item Spacing:** `space-y-2.5` to `space-y-4`
- **Grid Gaps:** `gap-2` (metrics), `gap-4` (layout grids)
