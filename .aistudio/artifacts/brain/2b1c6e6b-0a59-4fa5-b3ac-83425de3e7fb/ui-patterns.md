# Exhaustive MatchDetailModal UI Token Dictionary

This document contains **every single UI token** extracted directly from `MatchDetailModal.tsx`, providing a complete design token reference for building and styling components across the entire app.

---

## 1. Border Style Tokens (Exhaustive)

### Width & Directional Tokens
- **Full Border (All Sides)**: `border` (1px solid default)
- **Top Border (Dividers & Separators)**: `border-t`
- **Bottom Border (Headers & Bars)**: `border-b`
- **Left/Right Borders**: `border-l`, `border-r`

### Exact Border Color & Opacity Combinations
- **Modal Container Primary Border**: `border border-slate-100 dark:border-slate-800/80`
- **Header Bottom Divider**: `border-b border-slate-100 dark:border-slate-800/60`
- **Content Section Top Divider**: `border-t border-slate-200/60 dark:border-slate-800/60`
- **Subtle Card / Banner Border**: `border border-slate-100 dark:border-slate-800/40`
- **Value Bet (+EV) Highlight Border**: `border border-emerald-500/20`
- **Segmented Control / Internal Border**: `border border-slate-200 dark:border-slate-800`

---

## 2. Color Tokens (Tailwind / Hex)

### Backgrounds & Surfaces
- **Modal Overlay Backdrop**: `bg-black/60 dark:bg-black/80 backdrop-blur-md`
- **Primary Modal / Card Surface**: `bg-white dark:bg-[#0B0F17]`
- **Nested Inner Card / Sub-surface**: `bg-slate-50 dark:bg-slate-900/60`
- **Nested Deep Card (Level 2)**: `bg-white dark:bg-[#070A0F]`
- **Sub-navigation / Header Pill Container**: `bg-slate-100 dark:bg-slate-900/80`
- **Active Tab Surface**: `bg-white dark:bg-[#0B0F17]` (with `shadow-xs`)

### Text Colors
- **Primary Text**: `text-slate-900 dark:text-slate-100` / `text-slate-900 dark:text-white`
- **Secondary / Subdued Text**: `text-slate-500 dark:text-slate-400`
- **Highlight / Accent Text**: `text-slate-800 dark:text-slate-200`
- **Muted Separators / Dots**: `text-slate-300 dark:text-slate-600`
- **Live / Active Accent**: `text-rose-600 dark:text-rose-400`
- **Draw Accent**: `text-amber-600 dark:text-amber-400`
- **Away / Cyan Accent**: `text-cyan-600 dark:text-cyan-400`
- **Value Bet (+EV) Accent**: `text-emerald-700 dark:text-emerald-400`

### Status & Badge Fills
- **Live Dot / Indicator**: `bg-rose-500`
- **Cyan Badge Container**: `bg-cyan-50 dark:bg-cyan-950/80 text-cyan-700 dark:text-cyan-400`
- **Value Bet Container**: `bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-500/20`
- **Close / Icon Button Container**: `bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white`

---

## 3. Typography Tokens

### Font Families
- **Sans-Serif (Default UI)**: `font-sans`
- **Monospace (Odds, Probabilities, Scores, Times)**: `font-mono`

### Font Sizes & Leading Scale
- **Extra Tiny (Badges, Dots, Meta labels)**: `text-[9px]`, `text-[10px]`, `text-[11px]`
- **Small (Standard labels, Tabs, Metadata)**: `text-xs`
- **Medium (Team Names, Subheaders)**: `text-base`
- **Large (Hero Scores)**: `text-base sm:text-2xl`

### Font Weights
- **Normal / Medium**: `font-normal`, `font-medium`, `font-semibold`
- **Bold / Heavy**: `font-bold`, `font-extrabold`, `font-black`

---

## 4. Spacing & Layout Tokens

### Padding & Margins
- **Modal Outer Padding**: `p-1.5 sm:p-4`
- **Modal Inner Body Padding**: `p-3 sm:p-6`
- **Top Bar Padding**: `px-3 sm:px-6 pt-3 sm:pt-4 pb-2.5 sm:pb-3`
- **Hero Banner Padding**: `p-2.5 sm:p-5`
- **Card / Metric Box Padding**: `p-1.5`, `p-2`, `p-2.5`, `p-4`
- **Vertical Spacing Stacks**: `space-y-3`, `space-y-3.5`, `space-y-4`, `space-y-5`

### Grid & Flex Utility Tokens
- **Grid Structure**: `grid grid-cols-12`, `grid-cols-3`, `grid-cols-5`
- **Flex Alignment**: `flex items-center justify-between gap-2 sm:gap-3`
- **Overflow & Truncation**: `min-w-0 flex-nowrap overflow-x-auto no-scrollbar truncate`

---

## 5. Border Radius & Elevation (Shadows)

### Border Radius
- **Small Badges / Pills**: `rounded-md`, `rounded-lg`
- **Sub-nav Buttons / Containers**: `rounded-xl`
- **Inner Cards / Banners**: `rounded-xl sm:rounded-2xl`
- **Modal Container**: `rounded-2xl sm:rounded-3xl`
- **Badges / Avatars**: `rounded-full`

### Box Shadows
- **Micro Shadows**: `shadow-2xs`, `shadow-xs`
- **Standard Card Elevation**: `shadow-xs`
- **Major Modal Elevation**: `shadow-2xl shadow-slate-900/10 dark:shadow-black/70`

---

## 6. Animation & Transition Tokens
- **Transitions**: `transition-colors`, `transition-all`, `duration-150`, `duration-300`
- **Modal Entry Animation**: `animate-in fade-in duration-150`
- **Pulsing Live Indicator**: `animate-pulse`
- **Loading Spinners**: `animate-spin`
