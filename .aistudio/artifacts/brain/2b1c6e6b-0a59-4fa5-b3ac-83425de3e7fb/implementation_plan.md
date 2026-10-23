# Implementation Plan: Achieving 100% Design Consistency via Centralized UI Primitives

## Expert-Level Root Cause Analysis

Why has manual utility-class application failed to achieve absolute consistency across the app?
1. **Decentralized Markup Duplication**: Every component (`FixtureCard`, `TipsSection`, `LeagueStandings`, modals, etc.) currently writes its own wrapper `div` with manual Tailwind classes. As features evolve, classes drift (e.g., some use `rounded-2xl`, some `rounded-md`, some `border-slate-200`, some `border-slate-100`).
2. **Lack of Reusable UI Primitives**: The codebase lacks a foundational UI library (`Card`, `Modal`, `Button`, `Badge`). Without these, developers (and AI agents) must remember dozens of complex class strings for every new element.
3. **Fragmented Dark Mode Surfaces**: Different components mix background tokens (`dark:bg-[#0B0F17]`, `dark:bg-[#161b22]`, `dark:bg-slate-900`), breaking visual cohesion during theme toggling.

---

## The Solution: Centralized Design Primitives

To definitively solve this, we will build a lightweight, bulletproof set of shared UI primitive components in `src/components/ui/` that are **100% derived from `MatchDetailModal`**. All other components will then consume these primitives.

---

## Proposed Changes

### 1. Create Core UI Primitives (`src/components/ui/`)
- **`Card.tsx`**: Standardized card container replicating the exact border, shadow, and background of the Match Detail Modal cards.
- **`Modal.tsx`**: Standardized modal wrapper with backdrop blur and responsive sizing.
- **`Badge.tsx`**: Standardized pill/badge component for statuses, counts, and categories.
- **`Button.tsx`**: Standardized primary and secondary buttons.

### 2. Refactor Key Components to Consume Primitives
- **`FixtureCard.tsx`**: Refactor to use `<Card>`.
- **`TipsSection.tsx`**: Refactor container and item cards to use `<Card>`.
- **`LeagueStandings.tsx`**: Refactor wrapper table container to use `<Card>`.
- **`PrebuiltAccumulators.tsx`**: Refactor accumulator leg cards to use `<Card>`.
- **`PredictionHistoryView.tsx`**: Refactor history list container to use `<Card>`.

---

## Verification Plan
1. Run `compile_applet` and `lint_applet` to ensure zero TypeScript or syntax errors.
2. Visually verify across all tabs (Predictions, Accumulators, Standings, History, Trends) that backgrounds, borders (`border-slate-100 dark:border-slate-800/80`), corner radii (`rounded-2xl` / `rounded-3xl`), and shadows (`shadow-xs`) are 100% identical to `MatchDetailModal`.
