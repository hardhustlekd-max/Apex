# Clean Borderless Redesign Implementation Plan

## Overview
Transform all UI surfaces into a clean, borderless, modern aesthetic adhering to Apple and Linear design principles:
- Tone-on-tone surface depth separation (`bg-[#101728]` on `bg-[#070C14]` in dark mode; `bg-[#FFFFFF]` on `bg-[#F4F6FA]` in light mode)
- Diffuse soft shadows (`shadow-[0_4px_24px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.4)]` and `shadow-[0_24px_64px_rgba(0,0,0,0.8)]` for modals)
- Modern `rounded-2xl` and `rounded-3xl` surface geometry
- Elimination of harsh 1px borders wrapping cards, pills, modals, inputs, and tab containers
- Retention of wireframe color tokens: Neon Lime `#A3FF12` (selected/actions), Electric Blue `#2563EB`, Dark background `#070C14` / Card `#101728`, Light background `#F4F6FA` / Card `#FFFFFF`
- Responsive tactile micro-interactions (`hover:scale-105 active:scale-95`)

## Completed Refactoring
1. **Header & Navigation**:
   - `Header.tsx`: Converted to borderless glassmorphism (`backdrop-blur-xl bg-white/80 dark:bg-[#070c14]/80`), borderless rounded-2xl action buttons, clean Live indicator.
   - `BottomNavDock.tsx`: Floating borderless dock (`rounded-full shadow-[0_12px_36px_rgba(0,0,0,0.12)]`), neon floating action button (`#A3FF12`), high-contrast active tab labels.
2. **Main Feed & Wireframe**:
   - `FixturesList.tsx`: Borderless category pills, calendar pills (`#2563EB` selected), subtabs (`Upcoming`, `Live`, `History`), and active filter chips.
   - `SimplifiedPredictionsWireframe.tsx`: Match cards, league headers, probability chips, pagination bar refactored to borderless `rounded-3xl` containers.
3. **Standings & Accumulators**:
   - `PrebuiltAccumulators.tsx`: Borderless parlay cards, metric chips, and category switchers.
   - `LeagueStandings.tsx`: Converted table and league pills to borderless surfaces; replaced thick left border with soft background tint.
   - `PredictionHistoryView.tsx`: Borderless stats overview and match history cards.
4. **Modals & Dialogs**:
   - `MatchDetailModal.tsx`: Borderless hero scoreboard, stats radar, and tab container.
   - `SettingsModal.tsx`: Borderless database metrics cards, provider items, and tab segments.
   - `TerminalModal.tsx`: Borderless console logs, filters, and stat counters.
   - `LeagueSelectorModal.tsx` & `FixturesFilterModal.tsx`: Borderless directory and filter forms.
5. **UI Primitives**:
   - `Card.tsx`: Borderless `rounded-3xl` with diffuse soft shadow.
   - `Badge.tsx`: Borderless soft-tint status badges.
   - `Button.tsx`: Borderless buttons with active press micro-interactions.
   - `Modal.tsx`: Borderless dialog container with diffuse elevation.
